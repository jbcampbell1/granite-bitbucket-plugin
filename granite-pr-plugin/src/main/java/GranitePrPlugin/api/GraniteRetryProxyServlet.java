package GranitePrPlugin.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import javax.servlet.http.*;
import javax.servlet.ServletException;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class GraniteRetryProxyServlet extends HttpServlet {
  private static final Logger log = LoggerFactory.getLogger(GraniteRetryProxyServlet.class);

  private String targetUrl = "http://host.docker.internal:3000";

  @Override public void init() throws ServletException {
    String cfg = getServletConfig() != null ? getServletConfig().getInitParameter("targetUrl") : null;
    String env = System.getenv("GRANITE_RETRY_URL");
    if (cfg != null && !cfg.isEmpty()) targetUrl = cfg;
    else if (env != null && !env.isEmpty()) targetUrl = env;
    log.info("GraniteRetryProxyServlet initialised; targetUrl={}", targetUrl);
  }

  @Override protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String sha = req.getHeader("X-Granite-Sha");
    log.debug("Retry request: user={}, sha={}, eventKey={}, reqId={}",
        req.getRemoteUser(), sha, req.getHeader("X-Event-Key"), req.getHeader("X-Request-Id"));

    markInProgress(sha); // best-effort; logs its own errors

    byte[] body = readAll(req.getInputStream());
    log.debug("Forwarding {} bytes to {}", body.length, targetUrl);

    try {
      HttpURLConnection c = (HttpURLConnection) new URL(targetUrl).openConnection();
      c.setConnectTimeout(10000);
      c.setReadTimeout(30000);
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      c.setRequestProperty("X-Event-Key", orDefault(req.getHeader("X-Event-Key"), "pr:opened"));
      c.setRequestProperty("X-Request-Id", orDefault(req.getHeader("X-Request-Id"), UUID.randomUUID().toString()));

      try (OutputStream os = c.getOutputStream()) { os.write(body); }

      int code = c.getResponseCode();
      String ct = c.getHeaderField("Content-Type");
      String upstream = readText(code >= 400 ? c.getErrorStream() : c.getInputStream());
      log.info("Upstream responded {} (ct={}); body={}", code, ct, truncate(upstream, 500));

      resp.setStatus(code);
      resp.setContentType(ct != null ? ct : "application/json; charset=utf-8");
      if (upstream != null) resp.getWriter().write(upstream);
    } catch (Exception e) {
      log.error("Proxy call failed", e);
      resp.setStatus(502);
      resp.setContentType("application/json; charset=utf-8");
      resp.getWriter().write("{\"ok\":false,\"error\":\"proxy-failed\"}");
    }
  }

  private void markInProgress(String sha) {
    try {
      if (sha == null || sha.isEmpty()) return;
      String bb = System.getenv("BITBUCKET_URL");
      String pat = System.getenv("ACCESS_TOKEN");
      if (bb == null || pat == null) { log.debug("Skipping INPROGRESS (env missing)"); return; }

      URL u = new URL(bb + "/rest/build-status/1.0/commits/" + java.net.URLEncoder.encode(sha, "UTF-8"));
      HttpURLConnection s = (HttpURLConnection) u.openConnection();
      s.setConnectTimeout(10000); s.setReadTimeout(15000);
      s.setRequestMethod("POST"); s.setDoOutput(true);
      s.setRequestProperty("Content-Type", "application/json");
      s.setRequestProperty("Authorization", "Bearer " + pat);

      String payload = "{\"state\":\"INPROGRESS\",\"key\":\"Granite\",\"name\":\"AI Review\",\"description\":\"Retry requested\"}";
      try (OutputStream os = s.getOutputStream()) { os.write(payload.getBytes(StandardCharsets.UTF_8)); }
      int code = s.getResponseCode();  // expected 204
      log.info("Build-status INPROGRESS -> {}", code);
      s.disconnect();
    } catch (Exception e) {
      log.warn("markInProgress failed", e);
    }
  }

  private static byte[] readAll(InputStream in) throws IOException {
    if (in == null) return new byte[0];
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    byte[] buf = new byte[8192]; int n;
    while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
    return bos.toByteArray();
  }
  private static String readText(InputStream in) throws IOException {
    if (in == null) return null;
    try (Reader r = new InputStreamReader(in, StandardCharsets.UTF_8)) {
      StringBuilder sb = new StringBuilder(); char[] buf = new char[4096]; int n;
      while ((n = r.read(buf)) != -1) sb.append(buf, 0, n);
      return sb.toString();
    }
  }
  private static String orDefault(String v, String d) { return (v == null || v.isEmpty()) ? d : v; }
  private static String truncate(String s, int max) { return (s == null || s.length() <= max) ? s : s.substring(0, max) + "…"; }
}

package GranitePrPlugin.api;

import javax.servlet.http.*;
import javax.servlet.*;
import java.io.IOException;

public class HelloWorldServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {
        resp.setContentType("text/html");
        resp.getWriter().write("<h1>Hello from Bitbucket Plugin!</h1>");
    }
}
package ut.GranitePrPlugin;

import org.junit.Test;
import GranitePrPlugin.api.MyPluginComponent;
import GranitePrPlugin.impl.MyPluginComponentImpl;

import static org.junit.Assert.assertEquals;

public class MyComponentUnitTest {
    @Test
    public void testMyName() {
        MyPluginComponent component = new MyPluginComponentImpl(null);
        assertEquals("names do not match!", "myComponent", component.getName());
    }
}
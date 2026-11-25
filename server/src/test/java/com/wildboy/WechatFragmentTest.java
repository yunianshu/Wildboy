package com.wildboy;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WechatFragmentTest {
  static final String SOURCE = "https://mmbiz.qpic.cn/mmbiz_png/route/640?wx_fmt=png";
  static final String ARTICLE = """
      <section style="padding: 12px;background-color: #eef6f0">
        <h2 style="text-align:center;color:rgb(28, 98, 66)">集合安排</h2>
        <p style="letter-spacing: 1px;line-height: 1.75">请携带<strong>饮水</strong>和外套。</p>
        <table><tr><th>时段</th><th>地点</th></tr><tr><td>上午</td><td>入口</td></tr></table>
        <img data-src="%s" src="data:image/gif;base64,placeholder">
      </section>
      """.formatted(SOURCE);

  @Test void importsTypographyAndCopiesEachWechatImageOnce() {
    var images = mock(WechatImageImporter.class);
    when(images.localize(SOURCE)).thenReturn("/assets/uploads/walk.png");
    var result = new WechatImportController(images).importFragment(
        new WechatImportController.Input(ARTICLE + "<img data-src='" + SOURCE + "'>"));
    assertTrue(result.warnings().isEmpty());
    assertTrue(result.html().contains("text-align:center;color:rgb(28, 98, 66)"));
    assertTrue(result.html().contains("<strong>饮水</strong>"));
    assertTrue(result.html().contains("<td>入口</td>"));
    assertTrue(result.html().contains("/assets/uploads/walk.png"));
    assertFalse(result.html().contains("data-src"));
    verify(images, times(1)).localize(SOURCE);
    var nodes = ArticleMarkdown.toNodes("~~~wildboy-wechat\n" + result.html() + "\n~~~");
    var block = (Map<?,?>)nodes.getFirst();
    assertEquals("wechat", block.get("type"));
    assertTrue(block.get("nodes") instanceof List<?>);
    assertTrue(block.get("nodes").toString().contains("name=table"));
  }

  @Test void failedImageImportPreservesTheOriginalAndReportsIt() {
    var images = mock(WechatImageImporter.class);
    when(images.localize(SOURCE)).thenThrow(WechatFragment.invalid("无法下载"));
    var result = new WechatImportController(images).importFragment(new WechatImportController.Input(ARTICLE));
    assertTrue(result.html().contains(SOURCE));
    assertFalse(result.warnings().isEmpty());
  }

  @Test void editorEncodedFragmentPreservesEntitiesAndLiteralCodeDelimiters() {
    String html = "<p>路线 A &amp; B</p><pre>示例\n```\n&lt;地点&gt;</pre>";
    String encoded = Base64.getEncoder().encodeToString(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    assertEquals(new WechatFragment(html).nodes(), WechatFragment.fromFence("base64:" + encoded + "\n").nodes());
    assertThrows(ApiException.class, () -> WechatFragment.fromFence("base64:!"));
  }

  @Test void normalizesStyleAndExcludesUnsupportedMarkupAtDisplayBoundary() {
    var f = new WechatFragment("""
      <p onclick="unwanted()" style="position:fixed;background-image:url(file);color:#206040">林间步道</p>
      <iframe>播放器</iframe><script>unwanted()</script><img src="file:///photo">
      <a href="custom:action">详情</a>
      """);
    assertTrue(f.html().contains("color:#206040"));
    for (String attribute : List.of("onclick", "unwanted", "position", "url(file)", "iframe", "<script", "file://", "custom:"))
      assertFalse(f.html().contains(attribute));
    assertFalse(f.warnings().isEmpty());
    assertEquals("code", ((Map<?,?>)ArticleMarkdown.toNodes("~~~java\nsample\n~~~").getFirst()).get("type"));
  }
}

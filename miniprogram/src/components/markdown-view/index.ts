// 文章 Markdown 结构化节点渲染：仅原生组件，不使用 rich-text/web-view。
// 节点由服务端 commonmark 解析生成（type: heading|paragraph|image|list|
// code|table|hr；引文块带 quote 标记扁平输出；行内 spans: text|bold|italic|code|link）。
Component({ properties: { nodes: { type: Array, value: [] } } });

# 静态设计绘图脚本

这是两份现存 Python/Pillow 绘图脚本的便携归档副本。仅替换了原运行环境的绝对路径、增加输出和字体配置，保留历史布局、文字及示例数据。不是小程序页面源码，也不是可点击原型。

| 脚本 | 生成图片 |
| --- | --- |
| `render_user_pages.py` | `01-list-and-my.png`、`02-enrollments-and-success.png` |
| `render_login.py` | `wildboy-wechat-login.png` |

首页、详情/报名确认、管理员设计的早期原始绘图源已缺失，不在此目录中重建冒充原稿。

## 运行

需要 Python 3、Pillow 和含中文的字体。照片直接读取仓库 `miniprogram/src/assets/`，无需重复下载。字体不随仓库分发；默认使用系统 Noto Sans CJK 的 Regular/Bold TTC，字体集合索引为 2。

```sh
# 在仓库根目录执行；建议使用独立虚拟环境
python3 -m venv docs/design/source/.venv
. docs/design/source/.venv/bin/activate
python3 -m pip install -r docs/design/source/requirements.txt
python3 docs/design/source/render_user_pages.py
python3 docs/design/source/render_login.py
```

Windows 可使用同一虚拟环境的 `docs\design\source\.venv\Scripts\python.exe` 运行脚本，无需修改 PowerShell 执行策略；请通过下述字体变量指定本机已安装的中文字体。

默认输出到本目录的 `generated/`，不会覆盖 `../previews/` 中的归档原图。可按需配置：

```sh
WILDBOY_DESIGN_OUTPUT=./design-output \
WILDBOY_FONT_DIR=/path/to/noto-fonts \
python3 docs/design/source/render_login.py
```

也支持 `WILDBOY_FONT_REGULAR`、`WILDBOY_FONT_BOLD` 单独指定字体路径，以及 `WILDBOY_FONT_INDEX` 指定 TTC 索引（使用普通 TTF/OTF 时一般设为 0）。字体或渲染库不同会影响排版与文件哈希。

归档验证：2026-10-26，Pillow 12.3.0、Noto Sans CJK TTC 索引 2 环境中，两份便携脚本成功运行，生成的三张图与归档 PNG **像素及文件字节均一致**。这只证明该验证环境下的重现结果，不保证任意字体/平台逐字节一致。其余三张图仅有原图归档。

图内过时的“尚未实现”标签为历史文字，说明见 [设计归档索引](../README.md)。

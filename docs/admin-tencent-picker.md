# 后台上车点设置：地图选址

在「上车点设置」点击「新增上车点」，直接在地图弹窗内搜索或选地址。在地图内确认后即保存，不需要再填表或点另一个保存按钮。「编辑」同样直接打开选址弹窗，保存时沿用原上车点标识。

## 构建配置

将腾讯位置服务 Key 配置为 `VITE_TENCENT_MAP_PICKER_KEY`。本地开发可写入 `admin/.env.local`。使用仓库的生产部署脚本时，在构建服务器的 `/root/Wildboy/admin/.env.production.local` 中配置该变量，下次构建后台时生效。配置文件已由 Git 忽略。

若 Key 启用了 WebService 域名白名单，在该 Key 的白名单中加入腾讯选点组件的域名 `mapapi.qq.com`。组件页面能打开，但地点搜索或地址查询返回 `110` 时，可根据腾讯返回的来源域名核对这项授权。[腾讯地图选点组件文档](https://lbs.qq.com/webApi/component/componentGuide/componentPicker)

选点使用与小程序导航一致的 GCJ-02 坐标。已有坐标会作为打开地图时的中心，首次选点默认从厦门开始。地图不可用时本次不能新增或更换地址，已保存地址不受影响。

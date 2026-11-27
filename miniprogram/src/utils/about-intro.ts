import type { Article } from "./articles";

// Full body and photo captions, bundled for native reading.
// Source: https://mp.weixin.qq.com/s/OjRCE0ZGklEVy9xyasem3w
export const aboutIntro = {
  title: "关于野小子",
  summary: "",
  activityId: null,
  coverUrl: "/assets/about-chuanxi.jpg",
  contentNodes: [
    {
      type: "paragraph",
      spans: [{ t: "text", s: "野小子户外俱乐部：成立于2016年，是一家以周末及节假日活动为主的户外运动组织。自创立以来，俱乐部已累计组织活动2000余次，拥有会员20000余人，逐渐成长为以纯户外；徙步；攀爬；高原徙步，重装露营的户外团队." }],
    },
    {
      type: "paragraph",
      spans: [{ t: "text", s: "俱乐部足迹遍布大江南北，曾深入西藏阿里转山，重装穿越珠峰东坡；走过他念他翁，重装完成新疆乌孙古道。见证过雨崩的日照金山，也邂逅过哈巴雪山的壮阔云海。在川西最美的格聂花海、亚丁三神山、长穿毕，都留下过野小子的足迹." }],
    },
    {
      type: "paragraph",
      spans: [{ t: "text", s: "野小子户外俱乐部坚持“周末出发、节假日远行”的节奏，让户外热爱与日常生活相融。无论你是初次尝试的新人，还是经验丰富的老驴，这里都有一群志同道合的伙伴，陪你走向山野，遇见风景。" }],
    },
    { type: "image", url: "/assets/about-chuanxi.jpg", caption: "2019 川西长穿毕摄" },
    { type: "image", url: "/assets/about-taniantaweng.jpg", caption: "2023年他念他翁摄" },
    { type: "image", url: "/assets/about-sanqingshan.jpg", caption: "2025年三清山摄" },
    { type: "image", url: "/assets/about-yubeng.jpg", caption: "2025雨崩摄" },
    { type: "image", url: "/assets/about-wusun.jpg", caption: "2022乌孙古道摄" },
    { type: "image", url: "/assets/about-everest.jpg", caption: "2024珠峰东坡摄" },
    { type: "image", url: "/assets/about-genie.jpg", caption: "2023年川西格聂花海" },
    { type: "image", url: "/assets/about-gongga.jpg", caption: "2024年川西贡嘎摄" },
  ],
} satisfies Pick<Article, "title" | "summary" | "coverUrl" | "contentNodes" | "activityId">;

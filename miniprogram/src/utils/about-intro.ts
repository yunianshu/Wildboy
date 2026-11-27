import type { Article } from "./articles";

// Editorial summary of the club's "关于野小子" article. Photos come from
// https://mp.weixin.qq.com/s/OjRCE0ZGklEVy9xyasem3w and are bundled for offline reading.
export const aboutIntro = {
  title: "关于野小子",
  summary: "周末出发，节假日远行。",
  activityId: null,
  coverUrl: "/assets/about-chuanxi.jpg",
  contentNodes: [
    {
      type: "paragraph",
      spans: [{ t: "text", s: "野小子户外俱乐部成立于 2016 年，主要在周末和节假日组织户外活动。平时一起徒步、登山，假期走得更远，也有人相约挑战高原徒步和重装露营。" }],
    },
    {
      type: "paragraph",
      spans: [{ t: "text", s: "从川西格聂的花海到雨崩的日照金山，我们走过新疆乌孙古道，也曾重装穿越珠峰东坡。封面是 2019 年的川西长穿毕，下面是 2024 年的珠峰东坡。" }],
    },
    { type: "image", url: "/assets/about-everest.jpg", caption: "2024 年 · 珠峰东坡" },
    {
      type: "paragraph",
      spans: [{ t: "text", s: "不论你是第一次徒步，还是已经走过许多条路线，都可以从一场适合自己的活动开始，和伙伴一起去山野。" }],
    },
  ],
} satisfies Pick<Article, "title" | "summary" | "coverUrl" | "contentNodes" | "activityId">;

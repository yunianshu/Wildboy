import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import HomeGalleryPreview from "../src/components/HomeGalleryPreview.vue";
import { request } from "../src/api";
import type { HomeGalleryConfig } from "../src/types";

vi.mock("../src/api", () => ({ request: vi.fn() }));
const config: HomeGalleryConfig = {
  eyebrow: "FIELD NOTES",
  title: "山野之间",
  mode: "AUTO_ARTICLES",
  slides: [],
};

it("shows the public article carousel and opens its editor from the current slide", async () => {
  vi.mocked(request).mockResolvedValueOnce({
    items: [
      { id: "official", title: "关于我们", isOfficial: true },
      {
        id: "first",
        title: "云上竹海",
        summary: "第一篇手记",
        coverUrl: "/assets/bamboo.jpg",
      },
      {
        id: "next",
        title: "沿溪徒步",
        summary: "第二篇手记",
        coverUrl: "/assets/creek.jpg",
      },
    ],
  });
  const wrapper = mount(HomeGalleryPreview, {
    props: { config, active: false },
  });
  await flushPromises();
  expect(request).toHaveBeenCalledWith(
    "/articles?page=0&size=10",
    expect.anything(),
  );
  expect(wrapper.get(".gallery-slide img").attributes("src")).toBe(
    "/assets/bamboo.jpg",
  );
  await wrapper.get('[aria-label="下一张轮播图"]').trigger("click");
  expect(wrapper.get(".gallery-copy").text()).toContain("第二篇手记");
  await wrapper.get('[aria-label="编辑图集轮播模块"]').trigger("click");
  expect(wrapper.emitted("edit")).toHaveLength(1);
  wrapper.unmount();
});

it("uses public home banners when there are no published articles and updates custom slides immediately", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({
      banners: [
        {
          id: "activity",
          title: "周末竹海",
          subtitle: "活动摘要",
          imageUrl: "/assets/forest.jpg",
        },
      ],
    });
  const wrapper = mount(HomeGalleryPreview, {
    props: { config, active: false },
  });
  await flushPromises();
  expect(wrapper.get(".gallery-slide img").attributes("src")).toBe(
    "/assets/forest.jpg",
  );
  const slide = {
    id: "camp",
    title: "过夜露营",
    imageUrl: "/assets/camp.jpg",
    subtitle: "在林间扎营",
    action: {
      type: "NONE" as const,
      page: "",
      activityId: "",
      articleId: "",
      wechatArticleUrl: "",
      popupTitle: "",
      popupText: "",
      popupImages: [],
    },
  };
  await wrapper.setProps({
    config: { ...config, mode: "CUSTOM", slides: [slide] },
  });
  expect(wrapper.get(".gallery-slide img").attributes("src")).toBe(
    slide.imageUrl,
  );
  expect(wrapper.get(".gallery-copy").text()).toContain(slide.subtitle);
  expect(wrapper.find('[aria-label="下一张轮播图"]').exists()).toBe(false);
  wrapper.unmount();
});

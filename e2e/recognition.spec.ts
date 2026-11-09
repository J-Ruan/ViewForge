import { test, expect, type Page } from "@playwright/test";
async function raster(
  page: Page,
  file = "annotated-step.svg",
  font = "Arial",
  jpeg = false,
) {
  return page.evaluate(
    async ({ file, font, jpeg }) => {
      const text = (
          await (await fetch(new URL(`examples/${file}`, location.href))).text()
        ).replaceAll("Arial", font),
        url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })),
        img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      return c.toDataURL(jpeg ? "image/jpeg" : "image/png", 0.85).split(",")[1];
    },
    { file, font, jpeg },
  );
}
async function upload(page: Page, n: number, data: string, jpeg = false) {
  await page.getByLabel(`上传视图 ${n}`, { exact: true }).setInputFiles({
    name: `annotated-${n}.${jpeg ? "jpg" : "png"}`,
    mimeType: jpeg ? "image/jpeg" : "image/png",
    buffer: Buffer.from(data, "base64"),
  });
}
async function tab(page: Page, isMobile: boolean | undefined, name: string) {
  if (isMobile)
    await page.locator(".mobile-tabs").getByText(name, { exact: true }).click();
}
test("dimensioned PNGs: automatic outline, eight dimensions, exact calibration, real 3D and persistence", async ({
  page,
  isMobile,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: "创建空白项目" }).click();
  await tab(page, isMobile, "二维视图");
  await upload(page, 1, await raster(page));
  await upload(page, 2, await raster(page, "annotated-top.svg"));
  const front = page.locator(".drawing-card").first(),
    top = page.locator(".drawing-card").nth(1);
  await expect(front.getByTestId("recognized-size")).toHaveText("90 × 60 mm", {
    timeout: 20000,
  });
  await expect(top.getByTestId("recognized-size")).toHaveText("90 × 50 mm", {
    timeout: 20000,
  });
  await expect(front).toContainText("8 处尺寸标注");
  await expect(front.locator(".contour-list")).toBeHidden();
  await front.getByRole("button", { name: "原图与识别依据" }).click();
  await expect(front.getByLabel("原图识别依据")).toBeVisible();
  await expect(front.locator(".recognition-source rect")).toHaveCount(8);
  await front.getByRole("button", { name: "查看净轮廓" }).click();
  await front
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .click();
  await top
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .click();
  await page.getByRole("button", { name: "生成 3D 模型", exact: true }).click();
  await tab(page, isMobile, "模型属性");
  await expect(page.getByTestId("dimension-0")).toHaveText("90.0");
  await expect(page.getByTestId("dimension-1")).toHaveText("50.0");
  await expect(page.getByTestId("dimension-2")).toHaveText("60.0");
  await expect(page.getByTestId("volume")).toHaveText("180,000 mm³");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("项目已保存到此浏览器");
  await page.reload();
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.getByRole("button", { name: "恢复浏览器保存的项目" }).click();
  await expect(page.getByRole("status")).toContainText("已恢复本地项目");
  await tab(page, isMobile, "二维视图");
  await expect(
    page.locator(".drawing-card").first().getByTestId("recognized-size"),
  ).toHaveText("90 × 60 mm");
  await expect(page.getByTestId("volume")).toHaveText("180,000 mm³");
  await page.screenshot({
    path: `test-results/recognition-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
});
test("dimension evidence can be corrected; inconsistent chains cannot be confirmed", async ({
  page,
  isMobile,
}) => {
  await page.goto("./");
  await tab(page, isMobile, "二维视图");
  await upload(page, 1, await raster(page));
  const front = page.locator(".drawing-card").first();
  await expect(front.getByTestId("recognized-size")).toHaveText("90 × 60 mm", {
    timeout: 20000,
  });
  await front.getByText("8 处尺寸标注 · 查看与修正").click();
  const input = front.locator(".dimension-reading input[type=number]");
  let total = 0;
  for (let i = 0; i < (await input.count()); i++)
    if ((await input.nth(i).inputValue()) === "90") total = i;
  await input.nth(total).fill("89");
  await expect(
    front.getByRole("button", { name: "确认轮廓与尺寸", exact: true }),
  ).toBeDisabled();
  await input.nth(total).fill("90");
  await expect(front.getByTestId("recognized-size")).toHaveText("90 × 60 mm");
  await expect(
    front.getByRole("button", { name: "确认轮廓与尺寸", exact: true }),
  ).toBeEnabled();
});
test("reads numeric dimensions in serif-font JPEG and native SVG without neural OCR", async ({
  page,
  isMobile,
}) => {
  await page.goto("./");
  await tab(page, isMobile, "二维视图");
  await upload(
    page,
    1,
    await raster(page, "annotated-step.svg", "Times New Roman", true),
    true,
  );
  await expect(
    page.locator(".drawing-card").first().getByTestId("recognized-size"),
  ).toHaveText("90 × 60 mm", { timeout: 20000 });
  const text = await page.evaluate(
    async () =>
      await (
        await fetch(new URL("examples/annotated-step.svg", location.href))
      ).text(),
  );
  await page.getByLabel("上传视图 1", { exact: true }).setInputFiles({
    name: "native.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(text),
  });
  await expect(
    page.locator(".drawing-card").first().locator(".source-preview summary"),
  ).toContainText("native.svg");
  await expect(
    page.locator(".drawing-card").first().getByTestId("recognized-size"),
  ).toHaveText("90 × 60 mm", { timeout: 15000 });
});

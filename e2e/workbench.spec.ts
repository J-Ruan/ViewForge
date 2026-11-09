import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
const svg = (w: number, h: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="M0 0H${w}V${h}H0Z" fill="#000"/></svg>`,
  );
const ready = async (page: import("@playwright/test").Page) => {
  await expect(page.getByTestId("dimension-0")).toHaveText("80.0", {
    timeout: 30000,
  });
};
const tab = async (
  page: import("@playwright/test").Page,
  name: string,
  isMobile: boolean | undefined,
) => {
  if (isMobile)
    await page.locator(".mobile-tabs").getByText(name, { exact: true }).click();
};
test("real upload → calibration → WASM reconstruction → editing → persistence → exports", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "让二维视图，拥有三维表达。" }),
  ).toBeVisible();
  await tab(page, "模型属性", isMobile);
  await ready(page);
  await expect(page.getByTestId("volume")).toContainText("mm³");
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: "创建空白项目" }).click();
  await tab(page, "二维视图", isMobile);
  await page.getByLabel("上传视图 1", { exact: true }).setInputFiles({
    name: "front.svg",
    mimeType: "image/svg+xml",
    buffer: svg(80, 60),
  });
  await page.getByLabel("上传视图 2", { exact: true }).setInputFiles({
    name: "top.svg",
    mimeType: "image/svg+xml",
    buffer: svg(80, 50),
  });
  for (let i = 1; i <= 2; i++) {
    await page.getByLabel(`视图 ${i} 宽度`, { exact: true }).fill("80");
    await page
      .getByLabel(`视图 ${i} 高度`, { exact: true })
      .fill(i === 1 ? "60" : "50");
  }
  await page
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .click();
  await page.getByRole("button", { name: "生成 3D 模型", exact: true }).click();
  await tab(page, "模型属性", isMobile);
  await ready(page);
  await expect(page.getByTestId("volume")).toHaveText("240,000 mm³");
  await tab(page, "三维模型", isMobile);
  const canvas = page.getByLabel("可旋转的三维候选模型");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box) {
    const before = await canvas.screenshot();
    if (isMobile) {
      const session = await page.context().newCDPSession(page);
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + 60, y: y + 25 }],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await session.detach();
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 60,
        box.y + box.height / 2 + 25,
        { steps: 8 },
      );
      await page.mouse.up();
    }
    await expect
      .poll(async () => Buffer.compare(before, await canvas.screenshot()))
      .not.toBe(0);
  }
  await page.getByLabel("观察方向").selectOption("俯视");
  await tab(page, "模型属性", isMobile);
  await page.getByRole("button", { name: "添加切除特征" }).click();
  await page.getByLabel("半径", { exact: true }).fill("5");
  await page.getByRole("button", { name: "应用布尔切除" }).click();
  await expect(page.getByTestId("volume")).not.toHaveText("240,000 mm³");
  await expect(page.getByTestId("volume")).toContainText("235,291");
  await page.getByRole("button", { name: "查看投影叠加" }).click();
  await expect(page.getByRole("dialog", { name: "投影叠加" })).toContainText(
    "98.04%",
  );
  await page.getByRole("button", { name: "关闭投影叠加" }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByTestId("volume")).toHaveText("240,000 mm³");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.getByTestId("volume")).toContainText("235,291");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  let dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 项目文件" }).click();
  const json = await dl;
  const jsonPath = await json.path();
  expect(json.suggestedFilename()).toMatch(/viewforge.json$/);
  for (const [format, label] of [
    ["stl", "STL 模型 · mm"],
    ["glb", "GLB 模型 · m / Y-up"],
  ]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    page.once("dialog", (d) => d.accept());
    dl = page.waitForEvent("download");
    await page.getByRole("button", { name: label }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const bytes = await readFile((await file.path())!);
    if (format === "stl") {
      const triangles = bytes.readUInt32LE(80);
      expect(triangles).toBeGreaterThan(12);
      expect(bytes.length).toBe(84 + triangles * 50);
    } else {
      expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    }
  }
  await page.reload();
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.getByRole("button", { name: "恢复浏览器保存的项目" }).click();
  await tab(page, "模型属性", isMobile);
  await expect(page.getByTestId("volume")).toContainText("235,291");
  await page.getByLabel("打开项目文件").setInputFiles(jsonPath!);
  await expect(page.getByTestId("volume")).toContainText("235,291");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await tab(page, "三维模型", isMobile);
  await page.screenshot({
    path: `test-results/workbench-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
});
test("rejects unsafe SVG, unsupported DXF, and conflicting views", async ({
  page,
  isMobile,
}) => {
  await page.goto("./");
  await tab(page, "二维视图", isMobile);
  await page.getByLabel("上传视图 1", { exact: true }).setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
  });
  await tab(page, "三维模型", isMobile);
  await expect(page.getByRole("alert")).toContainText("安全");
  await page.getByRole("button", { name: "关闭错误", exact: true }).click();
  await tab(page, "二维视图", isMobile);
  await page.getByLabel("上传视图 1", { exact: true }).setInputFiles({
    name: "bad.dxf",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "0\nSECTION\n2\nENTITIES\n0\nSPLINE\n0\nENDSEC\n0\nEOF\n",
    ),
  });
  await tab(page, "三维模型", isMobile);
  await expect(page.getByRole("alert")).toContainText("SPLINE");
  await page.getByRole("button", { name: "关闭错误", exact: true }).click();
  await tab(page, "二维视图", isMobile);
  await page.getByLabel("视图 2 宽度", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .click();
  await tab(page, "三维模型", isMobile);
  await expect(page.getByRole("alert")).toContainText("冲突");
});
test("raster selects the object automatically and asks only for missing size", async ({
  page,
  isMobile,
}) => {
  await page.goto("./");
  await tab(page, "二维视图", isMobile);
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 80;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 100, 80);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 80, 60);
    return c.toDataURL().split(",")[1];
  });
  await page.getByLabel("上传视图 1", { exact: true }).setInputFiles({
    name: "front.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.locator(".drawing-card").first()).toContainText(
    "已提取零件轮廓",
  );
  await expect(page.locator(".drawing-card").first()).toContainText(
    "未读到可靠尺寸",
  );
  await page.getByLabel("视图 1 宽度", { exact: true }).fill("80");
  await expect(
    page.getByRole("button", { name: "确认轮廓与尺寸", exact: true }),
  ).toBeEnabled();
});
test("manual contour drawing and vertex dragging change actual solid volume", async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      if (this.name === "top.svg")
        await new Promise((resolve) => setTimeout(resolve, 400));
      return read.call(this);
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: "创建空白项目" }).click();
  await tab(page, "二维视图", isMobile);
  await page
    .getByRole("button", { name: "绘制视图 1 轮廓", exact: true })
    .click();
  const editor = page.getByLabel("正视图轮廓编辑器");
  const screen = async (x: number, y: number) =>
    editor.evaluate(
      (el, p) => {
        const v = new DOMPoint(p[0], 1 - p[1]).matrixTransform(
          (el as SVGSVGElement).getScreenCTM()!,
        );
        return { x: v.x, y: v.y };
      },
      [x, y],
    );
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]) {
    const p = await screen(x, y);
    if (isMobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  }
  await page.getByRole("button", { name: "闭合区域 (4)" }).click();
  await page.getByLabel("上传视图 2", { exact: true }).setInputFiles({
    name: "top.svg",
    mimeType: "image/svg+xml",
    buffer: svg(80, 50),
  });
  await expect(page.getByLabel("视图 2 宽度", { exact: true })).toBeDisabled();
  await page.getByLabel("视图 2 宽度", { exact: true }).fill("80");
  await page.getByLabel("视图 2 高度", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .click();
  await page.getByRole("button", { name: "生成 3D 模型", exact: true }).click();
  await tab(page, "模型属性", isMobile);
  await expect(page.getByTestId("volume")).toHaveText("240,000 mm³");
  await tab(page, "二维视图", isMobile);
  await editor.scrollIntoViewIfNeeded();
  const mid = await screen(0.5, 1);
  await page.mouse.click(mid.x, mid.y);
  const a = await screen(1, 1),
    b = await screen(0.5, 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "确认轮廓与尺寸", exact: true })
    .click();
  await tab(page, "模型属性", isMobile);
  await expect(page.getByTestId("volume")).toHaveText("180,000 mm³");
});

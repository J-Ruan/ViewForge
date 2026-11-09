import type { Contour, Drawing, Point, Project } from "./types";
export const rectangle: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
export const contour = (p: Point[], id = "outline"): Contour => ({
  id,
  points: p,
  closed: true,
  role: "region",
  selected: true,
});
export function drawing(
  kind: Drawing["kind"],
  width: number,
  height: number,
  points = rectangle,
): Drawing {
  const contours = [contour(points)];
  return {
    kind,
    width,
    height,
    contours,
    originalContours: structuredClone(contours),
    offset: [0, 0],
    mirror: false,
    confirmed: true,
    warnings: [],
  };
}
export const exampleNames = [
  "长方体",
  "L 型实体",
  "阶梯体",
  "简单斜面体",
  "带通孔零件",
  "带凹槽零件",
  "两视图的歧义",
];
export function example(index = 2): Project {
  const p: Project = {
    version: 1,
    name: exampleNames[index],
    unit: "mm",
    projection: "third",
    side: "right",
    views: [drawing("front", 80, 60), drawing("top", 80, 50)],
    features: [],
    note: "所有示例轮廓均实际参与反投影交集计算。蓝色模型是候选实体，内部结构尚未验证。",
  };
  if (index === 1)
    p.views[0] = drawing("front", 80, 60, [
      [0, 0],
      [1, 0],
      [1, 0.35],
      [0.4, 0.35],
      [0.4, 1],
      [0, 1],
    ]);
  if (index === 2)
    p.views[0] = drawing("front", 80, 60, [
      [0, 0],
      [1, 0],
      [1, 0.35],
      [0.68, 0.35],
      [0.68, 0.68],
      [0.34, 0.68],
      [0.34, 1],
      [0, 1],
    ]);
  if (index === 3)
    p.views[0] = drawing("front", 80, 60, [
      [0, 0],
      [1, 0],
      [1, 0.3],
      [0.25, 1],
      [0, 1],
    ]);
  if (index === 4) {
    const hole: Point[] = Array.from({ length: 96 }, (_, i) => [
      0.5 + 0.125 * Math.cos((i * Math.PI) / 48),
      0.5 + 0.2 * Math.sin((i * Math.PI) / 48),
    ]);
    p.views[1].contours.push(contour(hole, "hole"));
    p.views[1].originalContours = structuredClone(p.views[1].contours);
    p.note =
      "俯视轮廓明确包含内孔。本例交集会得到沿 Z 贯通的孔；这仍是最大候选，不能证明原物体的孔深。";
  }
  if (index === 5) {
    p.features = [
      {
        id: "groove",
        type: "groove",
        axis: "z",
        position: [20, 0, 45],
        width: 40,
        height: 50,
        depth: 15,
        radius: 5,
      },
    ];
    p.note =
      "凹槽由用户显式指定：从 (20, 0, 45) mm 沿 +Z 切除 15 mm。切除会改变正视投影，校验会如实显示偏差。";
  }
  if (index === 6)
    p.note =
      "同样的两个矩形投影可以对应实心块，也可以对应带内部空腔的零件。此算法仅给出最大候选实体，无法从这两幅外轮廓断定内部是否实心。";
  return p;
}
export function blankProject(): Project {
  const p = example(0);
  p.name = "未命名项目";
  p.views.forEach((v) => {
    v.contours = [];
    v.originalContours = [];
    v.confirmed = false;
  });
  p.note = "上传两个不同的标准正投影视图，或在二维编辑器中手动绘制封闭轮廓。";
  return p;
}

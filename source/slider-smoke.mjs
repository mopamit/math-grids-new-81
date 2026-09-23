import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  executablePath: process.env.CHROMIUM_PATH || "/tmp/chromium",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});

const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
const clickButton = async (wanted) => {
  for (const button of await page.$$("button")) {
    const label = await button.evaluate((element) =>
      (element.textContent || "").replace(/\s+/g, " ").trim(),
    );
    if (label === wanted || label.includes(wanted)) {
      await button.click();
      await pause();
      return;
    }
  }
  throw new Error(`Button not found: ${wanted}`);
};
const addFunction = async (expression) => {
  await clickButton("הוספת פונקציה");
  await page.waitForSelector("math-keyboard-field");
  await page.$eval(
    "math-keyboard-field",
    (field, value) => {
      if (typeof field.setValue === "function") field.setValue(value);
      else field.value = value;
      field.dispatchEvent(new CustomEvent("mkf-input", { bubbles: true, detail: { latex: value } }));
    },
    expression,
  );
  await pause();
  await clickButton("הוספה למישור");
};

const testUrl = process.env.TEST_URL || "http://127.0.0.1:8765/math-grids-81/";
const expressions = [
  "f(x)=ax+b",
  "g(x)=a*sin(x)",
  "h(x)=(x-a)^2+b",
  "p(x)=sqrt(abs(ax))+b",
  "q(x)=2a+x",
  "r(x)=a(x+1)",
];
const canvasHash = () =>
  page.$eval("canvas", (canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 97)
      hash = Math.imul(hash ^ data[index], 16777619);
    return hash >>> 0;
  });

for (const expression of expressions) {
  await page.goto(testUrl, { waitUntil: "networkidle0" });
  await page.waitForSelector("canvas");
  await page.select("#workspace-mode", "graphs");
  await pause();
  await clickButton("מחוונים דינמיים");
  await clickButton("הוספת מחוון");
  await clickButton("הוספת מחוון");
  const names = await page.$$eval(".live-slider b", (nodes) =>
    nodes.map((node) => (node.textContent || "").split("=")[0].trim()),
  );
  if (!names.includes("a") || !names.includes("b"))
    errors.push(`sliders were not created: ${names.join(", ")}`);
  await addFunction(expression);
  const titles = await page.$$eval(".function-object-label", (nodes) =>
    nodes.map((node) => node.getAttribute("title")),
  );
  if (!titles.includes(expression)) errors.push(`dynamic function was not added: ${expression}`);
  if (expression === expressions[0]) {
    const before = await canvasHash();
    await page.focus(".live-slider input[type=range]");
    await page.keyboard.press("ArrowRight");
    await pause();
    const after = await canvasHash();
    if (before === after) errors.push("changing a slider did not redraw the functions");
  }
}

console.log(JSON.stringify({ errors }));
await browser.close();
process.exit(errors.length ? 1 : 0);

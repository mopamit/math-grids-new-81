import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  executablePath: "/tmp/chromium",
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 920, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});

await page.goto(process.env.TEST_URL || "http://127.0.0.1:8765/", { waitUntil: "networkidle0" });
await page.select("#workspace-mode", "graphs");
await new Promise((resolve) => setTimeout(resolve, 100));
const addFunction = await page.$$("button");
let opened = false;
for (const button of addFunction) {
  const text = await button.evaluate((element) => (element.textContent || "").replace(/\s+/g, " ").trim());
  if (text.includes("הוספת פונקציה")) {
    await button.click();
    opened = true;
    break;
  }
}
if (!opened) {
  const state = await page.evaluate(() => ({
    body: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 500),
    buttons: [...document.querySelectorAll("button")].map((button) => button.textContent?.replace(/\s+/g, " ").trim()),
  }));
  throw new Error(`Function keyboard button was not found: ${JSON.stringify({ state, errors })}`);
}

await page.waitForSelector("math-keyboard-field");
await page.waitForFunction(() => {
  const keyboard = document.querySelector("math-keyboard-field");
  return keyboard?.shadowRoot?.querySelector("math-field");
});

const initial = await page.$eval("math-keyboard-field", (keyboard) => {
  const root = keyboard.shadowRoot;
  const labels = (id) => [...root.querySelectorAll(`[data-group="${id}"] .mkf-btn`)].map((button) => button.textContent.trim());
  const rects = (id) => [...root.querySelectorAll(`[data-group="${id}"] .mkf-btn`)].map((button) => {
    const rect = button.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  return {
    numbers: labels("numbers"),
    operations: labels("operations"),
    variables: labels("variables"),
    quick: labels("quick"),
    structures: labels("structures"),
    editing: labels("editing"),
    numberRects: rects("numbers"),
    operationRects: rects("operations"),
    advancedOpen: root.querySelector(".mkf-advanced-panel").classList.contains("mkf-open"),
  };
});

const expected = {
  numbers: ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "="],
  operations: ["+", "−", "×", "÷"],
  variables: ["x", "y"],
  quick: ["x²", "√x", "|x|", "π", "xₙ", "( )", "±"],
  structures: ["a⁄b", "1 a⁄b", "xⁿ", "ⁿ√x"],
  editing: ["◂", "▸", "⌫", "נקה"],
};

for (const [group, labels] of Object.entries(expected)) {
  if (JSON.stringify(initial[group]) !== JSON.stringify(labels)) {
    errors.push(`${group} labels: ${JSON.stringify(initial[group])}`);
  }
}
if (initial.advancedOpen) errors.push("advanced panel should start closed");

const bottomNumbers = initial.numberRects.slice(9);
if (bottomNumbers.length !== 3 || Math.max(...bottomNumbers.map((rect) => rect.width)) - Math.min(...bottomNumbers.map((rect) => rect.width)) > 1) {
  errors.push(`bottom number row widths: ${JSON.stringify(bottomNumbers)}`);
}
if (new Set(initial.operationRects.map((rect) => Math.round(rect.x))).size !== 1) {
  errors.push(`operations are not one column: ${JSON.stringify(initial.operationRects)}`);
}

await page.screenshot({ path: "/tmp/math-keyboard-layout-closed.png", fullPage: true });

await page.$eval("math-keyboard-field", (keyboard) => keyboard.shadowRoot.querySelector(".mkf-advanced-toggle").click());
const advanced = await page.$eval("math-keyboard-field", (keyboard) => {
  const root = keyboard.shadowRoot;
  return {
    open: root.querySelector(".mkf-advanced-panel").classList.contains("mkf-open"),
    titles: [...root.querySelectorAll(".mkf-advanced-panel .mkf-group-title")].map((title) => title.textContent.trim()),
    trig: [...root.querySelectorAll('[data-group="advanced-trig"] .mkf-btn')].map((button) => button.textContent.trim()),
    inverse: [...root.querySelectorAll('[data-group="advanced-inverse-trig"] .mkf-btn')].map((button) => button.textContent.trim()),
  };
});
if (!advanced.open) errors.push("advanced panel did not open");
if (advanced.trig.join(" ") !== "sin cos tan csc sec cot") errors.push(`trig labels: ${advanced.trig.join(" ")}`);
if (advanced.inverse.length !== 6) errors.push(`inverse trig count: ${advanced.inverse.length}`);
if (advanced.titles.length !== 5) errors.push(`advanced group count: ${advanced.titles.length}`);

await page.screenshot({ path: process.env.KEYBOARD_SCREENSHOT || "/tmp/math-keyboard-layout.png", fullPage: true });
console.log(JSON.stringify({ errors, initial, advanced }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);

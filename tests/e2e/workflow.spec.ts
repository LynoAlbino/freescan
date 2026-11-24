import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
async function documentImage(page: Page) {
  return Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1100;
      c.height = 1400;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#35463c";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.translate(100, 90);
      ctx.rotate(0.025);
      ctx.shadowColor = "#0008";
      ctx.shadowBlur = 25;
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, 860, 1200);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#202820";
      ctx.font = "bold 44px Arial";
      ctx.fillText("PRIVATE DOCUMENT", 75, 120);
      ctx.font = "32px Arial";
      ctx.fillText("Meeting notes", 75, 190);
      ctx.font = "26px Arial";
      const lines = [
        "Keep your documents on your device.",
        "This is a real optical recognition test.",
        "Invoice number 2026",
        "Total amount 128.50",
        "A clean scan makes paper useful.",
      ];
      lines.forEach((line, i) => ctx.fillText(line, 75, 300 + i * 65));
      ctx.strokeStyle = "#a8b4ad";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(75, 225);
      ctx.lineTo(780, 225);
      ctx.stroke();
      ctx.font = "italic 32px Georgia";
      ctx.fillStyle = "#315888";
      ctx.fillText("Approved", 75, 780);
      ctx.restore();
      return c.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
}
async function importPage(page: Page) {
  const buffer = await documentImage(page);
  await page.getByTestId("image-import").setInputFiles({
    name: "Meeting notes.png",
    mimeType: "image/png",
    buffer,
  });
  await expect(
    page
      .getByRole("img", { name: "Processed document", exact: true })
      .or(page.getByRole("alert")),
  ).toBeVisible({ timeout: 90000 });
  if (await page.getByRole("alert").isVisible())
    throw new Error(await page.getByRole("alert").innerText());
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}
test("real image processing, crop, history, PDF export and library recovery", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  context.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !/^(blob:|data:)/.test(r.url())
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your paper, simplified." }),
  ).toBeVisible();
  await importPage(page);
  await page
    .getByRole("button", { name: "Compare original", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Original photograph" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Compare original", exact: true })
    .click();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Top left corner" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Save crop" }).click();
  await expect(page.getByText("Enhancing your page…")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Black & White", exact: true })
    .click();
  await expect(page.getByText("Enhancing your page…")).not.toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move earlier", exact: true }).click();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(page.getByText("Enhancing your page…")).not.toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await page.getByRole("button", { name: "Generate PDF", exact: true }).click();
  await expect(
    page.getByText("Your PDF is ready and saved on this device."),
  ).toBeVisible({ timeout: 90000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF", exact: true }).click(),
  ]);
  const path = await download.path();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getTitle()).toBe("Meeting notes");
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Recover your draft")).toBeVisible();
  await page.getByRole("button", { name: "Continue editing" }).click();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("real English OCR, searchable PDF and fully offline reload", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "OCR/offline engine verified once; import/export runs across all browsers.",
  );
  await page.goto("/");
  await importPage(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Extracted text" }),
  ).toHaveValue(/PRIVATE DOCUMENT/, { timeout: 120000 });
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await page.getByRole("checkbox", { name: /Searchable PDF/ }).check();
  await page.getByRole("button", { name: "Generate PDF", exact: true }).click();
  await expect(
    page.getByText("Your PDF is ready and saved on this device."),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF", exact: true }).click(),
  ]);
  await download.saveAs(testInfo.outputPath("searchable.pdf"));
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    { timeout: 90000 },
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Recover your draft")).toBeVisible();
  await page.getByRole("button", { name: "Continue editing" }).click();
  await expect(
    page.getByRole("img", { name: "Processed document", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grayscale", exact: true }).click();
  await expect(page.getByText("Enhancing your page…")).not.toBeVisible();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Extracted text" }),
  ).toHaveValue(/PRIVATE DOCUMENT/, { timeout: 120000 });
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await page.getByRole("button", { name: "Generate PDF", exact: true }).click();
  await expect(
    page.getByText("Your PDF is ready and saved on this device."),
  ).toBeVisible();
});
test("PDF tools reject invalid files and produce merged PDFs", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Merge PDFs Bring your documents together." })
    .click();
  const d = await PDFDocument.create();
  d.addPage([200, 300]);
  const buffer = Buffer.from(await d.save());
  const input = page.locator('input[type=file][accept="application/pdf,.pdf"]');
  await input.setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toContainText("not a valid PDF");
  await input.setInputFiles([
    { name: "one.pdf", mimeType: "application/pdf", buffer },
    { name: "two.pdf", mimeType: "application/pdf", buffer },
  ]);
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(
    page.getByRole("button", { name: "Download result" }),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download result" }).click(),
  ]);
  const out = await PDFDocument.load(await readFile((await download.path())!));
  expect(out.getPageCount()).toBe(2);
  await page.getByRole("button", { name: "Save to Documents" }).click();
  await expect(page.getByText("Saved to My Documents.")).toBeVisible();
});
test("Hebrew interface, dark mode and camera denial fallback", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", {
    name: testInfo.project.name.startsWith("mobile")
      ? "Mobile navigation"
      : "Main navigation",
  });
  await navigation
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("dark");
  await page.getByLabel("Language", { exact: true }).selectOption("he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "הגדרות", exact: true }),
  ).toBeVisible();
  await page.getByLabel("שפה", { exact: true }).selectOption("en");
  await navigation.getByRole("button", { name: "Home", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException(
          "Camera permission denied by test.",
          "NotAllowedError",
        );
      },
    });
  });
  await page
    .getByRole("button", { name: "Scan Document Use your camera" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open device camera" }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Exit scanner" }).click();
  await expect(
    page.getByRole("heading", { name: "Your paper, simplified." }),
  ).toBeVisible();
});

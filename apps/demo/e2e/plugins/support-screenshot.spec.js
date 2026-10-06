import { test, expect } from "../fixtures.js";

const USER = {
  id: "e2e-support-screenshot",
  name: "Support Screenshot",
  email: "support-screenshot@example.com",
  roles: [],
};

const S3_URL = "https://s3.e2e.test/upload";
const KEY = "files-demo/support-screenshot/e2e/screenshot.png";
const MASK_FILL = [191, 191, 191];

// Pulls the PNG out of the multipart body S3 would have received.
const pngFromMultipart = (body) => {
  const start = body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const iend = body.indexOf(Buffer.from("IEND"), start);
  return body.subarray(start, iend + 8);
};

// Reads an uploaded PNG in the browser: its size, and per box the mean colour
// and the standard deviation of brightness.
const readPng = (page, png, boxes = {}) =>
  page.evaluate(
    async ({ base64, boxes }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const stats = {};
      for (const [name, b] of Object.entries(boxes)) {
        const data = ctx.getImageData(
          Math.round(b.x),
          Math.round(b.y),
          Math.max(1, Math.round(b.w)),
          Math.max(1, Math.round(b.h)),
        ).data;
        let r = 0;
        let g = 0;
        let bl = 0;
        const lum = [];
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          bl += data[i + 2];
          lum.push((data[i] + data[i + 1] + data[i + 2]) / 3);
        }
        const n = lum.length;
        const mean = lum.reduce((a, v) => a + v, 0) / n;
        const std = Math.sqrt(lum.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
        stats[name] = { rgb: [r / n, g / n, bl / n], std };
      }
      return { width: img.naturalWidth, height: img.naturalHeight, stats };
    },
    { base64: png.toString("base64"), boxes },
  );

// The viewport box of an element, shrunk by a few pixels so edges don't count.
const innerBox = async (locator, inset = 3) => {
  const b = await locator.boundingBox();
  return {
    x: b.x + inset,
    y: b.y + inset,
    w: b.width - 2 * inset,
    h: b.height - 2 * inset,
  };
};

const scale = (b, f) => ({ x: b.x * f, y: b.y * f, w: b.w * f, h: b.h * f });

const close = (a, b, tolerance = 12) =>
  a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

test.describe("SupportScreenshot", () => {
  let uploads;

  test.beforeEach(async ({ ldf, page }) => {
    await ldf.user(USER);
    await ldf.mock.request("support_screenshot_policy", {
      response: { url: S3_URL, fields: { key: KEY, bucket: "demo" } },
    });
    uploads = [];
    await page.route(`${S3_URL}**`, async (route) => {
      uploads.push(route.request().postDataBuffer());
      await route.fulfill({ status: page.s3Status ?? 204, body: "" });
    });
    await page.goto("/files-demo");
    await page.locator('input[type="password"]').fill("hunter2-secret");
    await page.getByTestId("support_screenshot").scrollIntoViewIfNeeded();
  });

  test("masks passwords and marked boxes, leaves out hidden elements, and leaves the page as it was", async ({
    page,
    ldf,
  }) => {
    const password = await innerBox(page.locator('input[type="password"]'));
    const masked = await innerBox(page.locator("[data-support-mask]"));
    const hidden = await innerBox(page.locator(".support-demo-hidden"));
    const sider = await page.locator("aside.ant-layout-sider").boundingBox();
    const menu = { x: sider.x + 10, y: sider.y + 30, w: 160, h: 150 };
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);

    await page.getByTestId("support_screenshot").click();
    await expect(
      page.getByTestId("support_screenshot_editor_image"),
    ).toBeVisible();
    await page.getByTestId("support_screenshot_use").click();
    await expect(page.getByText(`Uploaded ${KEY}`)).toBeVisible();

    expect(uploads).toHaveLength(1);
    const shot = await readPng(page, pngFromMultipart(uploads[0]), {
      password: scale(password, dpr),
      masked: scale(masked, dpr),
      hidden: scale(hidden, dpr),
      menu: scale(menu, dpr),
    });
    const viewport = page.viewportSize();
    expect(shot.width).toBe(Math.round(viewport.width * dpr));
    expect(shot.height).toBe(Math.round(viewport.height * dpr));
    expect(close(shot.stats.password.rgb, MASK_FILL)).toBe(true);
    expect(shot.stats.password.std).toBeLessThan(1);
    expect(close(shot.stats.masked.rgb, MASK_FILL)).toBe(true);
    expect(shot.stats.masked.std).toBeLessThan(1);
    // The badge is solid magenta on the page; none of it is drawn.
    const [r, g, b] = shot.stats.hidden.rgb;
    expect(r > 200 && g < 80 && b > 200).toBe(false);
    // The sticky side menu shows where it is on screen, though the page is
    // scrolled.
    expect(shot.stats.menu.std).toBeGreaterThan(5);

    await expect(page.locator('input[type="password"]')).toHaveValue(
      "hunter2-secret",
    );
    await expect(page.locator(".support-demo-hidden")).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    expect(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            "[data-support-capture-hide], [data-support-capture-mask], [data-support-capture-fixed], [data-support-capture-sticky]",
          ).length,
      ),
    ).toBe(0);

    expect(await ldf.state("support_last_screenshot").value()).toEqual({
      key: KEY,
      name: "screenshot.png",
      size: expect.any(Number),
      type: "image/png",
    });
  });

  test("a blur box and a crop survive into the uploaded PNG", async ({
    page,
  }) => {
    const note = page.getByText("Takes a screenshot of this page");
    const dpr = await page.evaluate(() => window.devicePixelRatio);

    // Plain capture first, for the unblurred text.
    await page.getByTestId("support_screenshot").click();
    await expect(
      page.getByTestId("support_screenshot_editor_image"),
    ).toBeVisible();
    const text = await innerBox(note, 0);
    await page.getByTestId("support_screenshot_use").click();
    await expect(page.getByText(`Uploaded ${KEY}`)).toBeVisible();
    const textInImage = scale(
      { ...text, w: Math.min(text.w, 300), h: 20 },
      dpr,
    );
    const plain = await readPng(page, pngFromMultipart(uploads[0]), {
      text: textInImage,
    });
    expect(plain.stats.text.std).toBeGreaterThan(10);
    await expect(
      page.getByTestId("support_screenshot_editor_image"),
    ).toHaveCount(0);

    await page.getByTestId("support_screenshot").click();
    const frame = page.getByTestId("support_screenshot_editor_image");
    await expect(frame).toBeVisible();
    // The page behind the editor is as it was captured; measure it there.
    const text2 = await innerBox(note, 0);
    const textInImage2 = scale(
      { ...text2, w: Math.min(text2.w, 300), h: 20 },
      dpr,
    );
    const img = frame.locator("img");
    // Wait for the image to load and the modal to finish animating open.
    await expect.poll(() => img.evaluate((el) => el.complete)).toBe(true);
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    const shown = await img.boundingBox();
    const naturalWidth = await img.evaluate((el) => el.naturalWidth);
    const toImage = naturalWidth / shown.width;
    const toFrame = (b) => scale(b, 1 / toImage);
    const drag = async (b) => {
      await page.mouse.move(shown.x + b.x, shown.y + b.y);
      await page.mouse.down();
      await page.mouse.move(shown.x + b.x + b.w / 2, shown.y + b.y + b.h / 2, {
        steps: 4,
      });
      await page.mouse.move(shown.x + b.x + b.w, shown.y + b.y + b.h, {
        steps: 4,
      });
      await page.mouse.up();
    };

    const blurInFrame = toFrame(textInImage2);
    await drag(blurInFrame);

    await page.getByText("Crop", { exact: true }).click();
    const cropInFrame = {
      x: blurInFrame.x - 20,
      y: blurInFrame.y - 20,
      w: blurInFrame.w + 60,
      h: blurInFrame.h + 50,
    };
    await drag(cropInFrame);

    await page.getByTestId("support_screenshot_use").click();
    await expect(page.getByText(`Uploaded ${KEY}`).first()).toBeVisible();
    await expect.poll(() => uploads.length).toBe(2);

    const crop = scale(cropInFrame, toImage);
    const blurredText = {
      x: textInImage2.x - crop.x,
      y: textInImage2.y - crop.y,
      w: textInImage2.w,
      h: textInImage2.h,
    };
    const edited = await readPng(page, pngFromMultipart(uploads[1]), {
      text: blurredText,
    });
    expect(Math.abs(edited.width - crop.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(edited.height - crop.h)).toBeLessThanOrEqual(2);
    expect(edited.stats.text.std).toBeLessThan(plain.stats.text.std / 2);
  });

  test("a failed upload fires onError, not onUse, and keeps the editor open", async ({
    page,
    ldf,
  }) => {
    page.s3Status = 403;
    await page.getByTestId("support_screenshot").click();
    await page.getByTestId("support_screenshot_use").click();
    await expect(
      page.getByText("The screenshot could not be uploaded."),
    ).toBeVisible();
    expect(uploads).toHaveLength(1);
    await expect(
      page.getByTestId("support_screenshot_editor_image"),
    ).toBeVisible();
    expect(await ldf.state("support_last_screenshot").value()).toBeFalsy();
  });
});

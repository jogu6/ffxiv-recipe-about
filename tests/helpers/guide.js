async function swipe(page, locator, fromRatio, toRatio) {
  const box = await locator.boundingBox();
  const client = await page.context().newCDPSession(page);
  const y = Math.max(80, box.y + 120);
  const point = (ratio) => ({ x: box.x + box.width * ratio, y });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(fromRatio)],
  });
  for (let step = 1; step <= 8; step++) {
    const ratio = fromRatio + ((toRatio - fromRatio) * step) / 8;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(ratio)],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

module.exports = { swipe };

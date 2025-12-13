/**
 * Playwright browser test for MCP Apps UI
 */

import { chromium } from 'playwright';

async function runTest() {
  console.log('Launching browser...');

  const browser = await chromium.launch({
    headless: false,
    devtools: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  // Listen for console messages
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]`, msg.text());
  });

  // Listen for errors
  page.on('pageerror', err => {
    console.error('[Browser Error]', err.message);
  });

  console.log('Navigating to test page...');
  await page.goto('http://localhost:3456/test');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  console.log('Page loaded. Waiting for widget...');

  // Wait a bit for widget to initialize
  await page.waitForTimeout(3000);

  // Check if widget root exists
  const widgetRoot = await page.$('#1mcp-widget-root');
  if (widgetRoot) {
    console.log('✓ Widget root found');
  } else {
    console.log('✗ Widget root NOT found');
  }

  // Look for the floating button
  const floatingButton = await page.$('button[style*="position: fixed"]');
  if (floatingButton) {
    console.log('✓ Floating button found');

    // Click it
    console.log('Clicking floating button...');
    await floatingButton.click();
    await page.waitForTimeout(1000);
  } else {
    console.log('✗ Floating button NOT found');

    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/mcp-test-debug.png', fullPage: true });
    console.log('Screenshot saved to /tmp/mcp-test-debug.png');
  }

  // Keep browser open for manual inspection
  console.log('\nBrowser is open. Press Ctrl+C to close.');

  // Wait indefinitely
  await new Promise(() => {});
}

runTest().catch(console.error);

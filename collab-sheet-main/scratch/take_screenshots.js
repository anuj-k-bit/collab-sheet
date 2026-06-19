// scratch/take_screenshots.js
import puppeteer from 'puppeteer-core';
import path from 'path';

const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const targetDir = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\98cfe6b2-cfdc-4f19-b0ff-7cf57172c279';
const prefix = process.argv[2] || 'before';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log(`Launching Chrome from: ${chromePath}`);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Sign-in Screen
  console.log('Navigating to sign-in page...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(1000);
  
  const signinPath = path.join(targetDir, `${prefix}_signin.png`);
  await page.screenshot({ path: signinPath });
  console.log(`Saved sign-in screen to: ${signinPath}`);

  // 2. Dashboard Screen
  console.log('Logging in as Guest Alice...');
  await page.type('#guestName', 'Alice');
  await page.click('button.btn-primary'); // "Continue as Guest"
  await sleep(1500); // Wait for dashboard transition
  
  const dashboardPath = path.join(targetDir, `${prefix}_dashboard.png`);
  await page.screenshot({ path: dashboardPath });
  console.log(`Saved dashboard to: ${dashboardPath}`);

  // Optional: open the dropdown and capture it
  console.log('Opening avatar dropdown...');
  await page.click('#dashAvatar');
  await sleep(300);
  const dropdownPath = path.join(targetDir, `${prefix}_dashboard_dropdown.png`);
  await page.screenshot({ path: dropdownPath });
  console.log(`Saved dashboard dropdown to: ${dropdownPath}`);
  
  // Close dropdown by clicking header logo
  await page.click('.dash-logo');
  await sleep(200);

  // 3. Spreadsheet Editor
  console.log('Creating a blank spreadsheet...');
  await page.click('.new-card'); // Create blank
  await sleep(1500); // Wait for spreadsheet grid to build
  
  // Select cell B2 (row 1, col 1 in 0-indexed terms)
  console.log('Selecting cell B2 and typing value...');
  const b2Selector = '#cell-1-1';
  await page.click(b2Selector);
  await sleep(200);
  
  // Start edit
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.type('123');
  await page.keyboard.press('Enter');
  await sleep(500);
  
  // Re-select B2 to show outline
  await page.click(b2Selector);
  await sleep(300);

  const editorPath = path.join(targetDir, `${prefix}_editor.png`);
  await page.screenshot({ path: editorPath });
  console.log(`Saved editor screen to: ${editorPath}`);

  // 4. Mobile Responsiveness at 375px
  console.log('Testing mobile layout...');
  await page.setViewport({ width: 375, height: 667 });
  await sleep(500);
  
  const mobilePath = path.join(targetDir, `${prefix}_mobile.png`);
  await page.screenshot({ path: mobilePath });
  console.log(`Saved mobile view to: ${mobilePath}`);

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});

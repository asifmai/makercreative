const puppeteer = require('puppeteer');
const pageUrl = 'https://mobbin.design/';
const moment = require('moment');
const fs = require('fs');
const path = require('path');
let browser;
// let appsUrls = [];
const appsUrls = JSON.parse(fs.readFileSync('appUrls.json', 'utf-8'));
const appsData = {apps: []};
// const appsData = JSON.parse(fs.readFileSync('appsData.json', 'utf-8'));
// const chromePath = 'c:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const runBot = async () => {
  try {
    browser = await launchBrowser();

    // Fetch Apps Urls
    // await fetchAppsUrls();

    // Fetch Apps Details
    for (let i = 0; i < appsUrls.length; i++) {
      console.log(`${i + 1}/${appsUrls.length} - Fetching app data for ${appsUrls[i]}`);
      await fetchData(appsUrls[i]);
    };
    
    // await browser.close();
    return 'Completed...';
  } catch (error) {
    console.log(dt(), 'Scraping Error: ', error)
    return error;
  }
};

const fetchAppsUrls = () => new Promise(async (resolve, reject) => {
  try {
    console.log(`Fetching Apps Urls...`);
    const page = await launchPage(browser);
    await page.goto(pageUrl, {timeout: 0, waitUntil: 'load'});
    let currentPosition;
    let scrollHeight;
    let cont = await page.$('#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div');
    for (let i = 0; i < 50; i++) {
      console.log(`Scrolling Page: ${i + 1}`);
      await page.evaluate((c) => {
        c.scrollTop = c.scrollHeight;
      }, cont);
      await page.waitFor(10000);
      cont = await page.$('#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div');
      currentPosition = await page.evaluate(c => c.scrollTop, cont);
      scrollHeight = await page.evaluate(c => c.scrollHeight, cont);
      console.log(currentPosition, scrollHeight);
    }
    appsUrls = await page.$$eval(
        '#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div > div.container-fluid > div > a',
        (elms) => elms.map((elm) => 'https://mobbin.design' + elm.getAttribute('href'))
    )
    fs.writeFileSync('appUrls.json', JSON.stringify(appsUrls));
    await page.close();
    resolve(true);
  } catch (error) {
    console.log(`fetchAppsUrls Error: ${error}`);
    reject(error);
  }
});

const fetchData = (url) => new Promise(async (resolve, reject) => {
  try {
    const appData = {};
    const page = await launchPage(browser);
    await page.goto(url, {timeout: 0, waitUntil: 'load'});
    
    // Get App Name
    await page.waitForSelector('#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div > div > div > a:nth-child(1) > h1');
    const appName = await page.$eval(
        '#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div > div > div > a:nth-child(1) > h1',
        (elm) => elm.innerText.trim()
    );
    appData.name = appName;
    appData.pages = [];

    // Get Images
    await page.waitForSelector('#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div > div.container-fluid > div > div > div.row > div[type="app"]');
    const appImages = await page.$$('#root > div > div:nth-child(3) > div > div:nth-child(3) > div > div:nth-child(3) > div > div.container-fluid > div > div > div.row > div[type="app"]');
    for (let i = 0; i < appImages.length; i++) {
      // Open an Image
      await appImages[i].click();
      await page.waitFor(1000);

      // Read Screen ID
      const rawScreenId = await page.evaluate('location.href');
      const screenId = rawScreenId.match(/(?<=#).*$/gi)[0].trim();
      console.log(`${i + 1}/${appImages.length} - Fetching Image for ${screenId}`);

      // Read Patterns
      const patterns = [];
      const patternsNodes = await page.$$('body > div:nth-child(11) > div > div > div:last-child  > div > div > div:nth-child(1) > div > button');
      if (patternsNodes) {
        for (let j = 0; j < patternsNodes.length; j++) {
          const pattern = await page.evaluate(
              pn => pn.innerText.trim(), 
              patternsNodes[j]
          )
          patterns.push(pattern);
        }
      }
      
      // Read Elements
      const elements = [];
      const elementsNodes = await page.$$('body > div:nth-child(11) > div > div > div:last-child  > div > div > div:nth-child(2) > div > button');
      if (elementsNodes) {
        for (let j = 1; j < elementsNodes.length; j++) {
          const element = await page.evaluate(
              en => en.innerText.trim(), 
              elementsNodes[j]
          )
          elements.push(element);
        }
      }

      // Download Image
      await page.screenshot({path: 'screen.png'});
      await page.waitForSelector('body > div:nth-child(11) > div > div > div > div > div > img:first-of-type');
      const imageUrl = await page.$eval(
          'body > div:nth-child(11) > div > div > div > div > div > img:first-of-type',
          elm => elm.getAttribute('src')
      );
      const imagePage = await launchPage(browser);
      await imagePage._client.send('Network.enable', {
        maxResourceBufferSize: 1024 * 1204 * 100,
        maxTotalBufferSize: 1024 * 1204 * 200,
      })
      const viewSource = await imagePage.goto(imageUrl, {timeout: 0, waitUntil: 'load'});
      const imgPath = path.resolve(__dirname, `images/${screenId}.PNG`);
      fs.writeFileSync(imgPath, await viewSource.buffer());
      await imagePage.close();

      // Close the Image
      const closeButton = await page.$('body > div:nth-child(11) > div > div > div > div > div:nth-child(1) > button');
      await closeButton.click();
      await page.waitFor(1000);

      // Save Image Data to App
      const imgObject = {
        screenId, imageUrl, patterns, elements
      }
      appData.pages.push(imgObject);
    }

    appsData.apps.push(appData);
    fs.writeFileSync('appsData.json', JSON.stringify(appsData));
    await page.close();
    resolve(true);  
  } catch (error) {
    console.log(`fetchData ${url} Error: ${error}`);
  }
});

const launchPage = (browser) => new Promise(async (resolve, reject) => {
  try {
    // Create New Page
    const page = await browser.newPage();

    // Set user agent for page.
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36';
    await page.setUserAgent(userAgent);

    // Pass the Webdriver Test.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    // Set Page view port
    // await page.setViewport({
    //   width: 1366,
    //   height: 768
    // });

    // const blockedResources = ['image'];
    const blockedResources = [];
    // Set Request Interception to avoid receiving images, fonts and stylesheets for fast speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (blockedResources.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // await page.authenticate({username: proxyUser, password: proxyPassword});
    // Set Session Cookie
    // await page.setCookie({
    //   'name': 'li_at',
    //   'value': process.env.LINKEDIN_SESSION_COOKIE_VALUE,
    //   'domain': '.www.linkedin.com'
    // })

    // Set Extra Header for request
    // await page.setExtraHTTPHeaders({'iqbal': 'Pakistan'});

    // Authenticate Proxy Server
    // await page.authenticate({username: proxyUser, password: proxyPassword});
    resolve(page);
  } catch (error) {
    console.log(dt(), 'Launch Page Error: ', error)
    reject(error);
  }
});

const launchBrowser = () => new Promise(async (resolve, reject) => {
  try {
    const browser = await puppeteer.launch({
      // executablePath: chromePath,
      headless: true,                        // To run on headless: true
      args: [
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        // '--user-data-dir=c:\\users\\asifm\\appdata\\local\\google\\chrome\\user data\\default',
        // '--start-fullscreen',        //Starts the browser in full screen mode
        // '--window-size=1366,768',
        // '--user-data-dir'                  // This will use existing chrome open browser or open a new browser and use local setting, cookies of the user
        '--no-sandbox',                  // To run on linux
        // '--proxy-server=143.255.52.90:8080',    //To use a sock5 proxy
        // '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"',
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: null,    // Do not follow default view port and fill the page
      // userDataDir: `temp`,
    });
    console.log(dt(), 'Launched Browser');
    resolve(browser);
  } catch (error) {
    console.log(dt(), 'Browser Launch Error: ', error);
    reject(error);
  }
});

const dt = () => {
  return moment().format('YYYY-MM-DD HH:mm:ss') + ' -';
}

runBot();
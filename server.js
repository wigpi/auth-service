const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand').expand;
dotenvExpand(dotenv.config());
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let browser;

// Launch Puppeteer browser at startup
(async () => {
    browser = await puppeteer.launch({
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // reduces memory usage
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu' // disable GPU hardware acceleration
        ],
        headless: true // running headless is usually faster
    });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();

app.post('/auth', async (req, res) => {
    const $username = req.body.username;
    const $password = req.body.password;
    if (!$username || $username === '' || !$password || $password === '') {
        return res.status(400).send('Username and password parameters are required');
    }

    let context;
    let page;
    try {
        console.log('Authenticating user ' + $username + '...');
        // Create a new incognito context
        context = await browser.createBrowserContext();
        page = await context.newPage();
        await page.setRequestInterception(true);

        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        //console.log('Navigating to CAS login page...');
        await page.goto(process.env.CAS_LOGIN_URL, { waitUntil: 'domcontentloaded' });
        await page.type('input[name=username]', $username);
        await page.type('input[name=password]', $password);
        //console.log('Submitting form...');
        await page.click('button[type=submit]');

        await page.waitForSelector('#DivEntete_Version', { timeout: 5000 });
        const cookies = await page.cookies();

        // Add expiration handling for cookies
        cookies.forEach(cookie => {
            cookie.expires = new Date().getTime() + 2400000;
        });

        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({ status: 'success', data: { cookies } }));
        console.log('User authenticated successfully');
    } catch (error) {
        console.error('Error in /auth:', error);
        res.status(500).send('Failed to authenticate, please check your credentials');
    } finally {
        if (page) {
            await page.close(); // Ensure the page is closed after the request
        }
        if (context) {
            await context.close(); // Close the incognito context to clear all data
        }
    }
});

app.post('/check', async (req, res) => {
    const $cookies = req.body.cookies;
    if (!$cookies || $cookies.length === 0) {
        return res.status(400).send('Cookies parameter is required');
    }

    let context;
    let page;
    try {
        // Create a new incognito context
        context = await browser.createBrowserContext();
        page = await context.newPage();
        await page.setRequestInterception(true);

        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log('Injecting cookies...');
        await page.setCookie(...$cookies);
        console.log('Cookies injected...');
        console.log('Navigating to CAS login page...');

        await page.goto(process.env.EDT_URL, { waitUntil: 'networkidle2' });

        console.log('Checking cookies validity...');
        if (page.url().includes(process.env.CAS_DOMAIN)) {
            console.log('Cookies are invalid...');
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: 'fail', data: 'Cookies are invalid' }));
        } else if (page.url().includes(process.env.EDT_DOMAIN)) {
            console.log('Cookies are valid...');
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: 'success', data: 'Cookies are valid' }));
        } else {
            console.log('Unexpected domain. Cookies might be invalid.');
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: 'fail', data: 'Unexpected domain' }));
        }
    } catch (error) {
        console.error('Error in /check:', error);
        res.status(500).send('Failed to check cookies');
    } finally {
        if (page) {
            await page.close(); // Ensure the page is closed after the request
        }
        if (context) {
            await context.close(); // Close the incognito context to clear all data
        }
    }
});

async function devGetCookiesValidity() {
    fs.unlinkSync('cookies.json');
    const response = await axios.post('http://localhost:3000/auth', {
        username: '<your_username>',
        password: '<your_password>'
    });
    let $cookies = response.data.data.cookies;
    const $startTimestamp = new Date().getTime();

    fs.writeFileSync('cookies.json', JSON.stringify($cookies)); // Save cookies to a file

    setInterval(async () => {
        const $cookies = JSON.parse(fs.readFileSync('cookies.json'));
        const response = await axios.post('http://localhost:3000/check', {
            cookies: $cookies
        });

        if (response.data.status === 'fail') {
            console.log('Cookies are invalid');
            let $endTimestamp = new Date().getTime();
            console.log('Cookies duration: ' + ($endTimestamp - $startTimestamp) + 's');
            clearInterval(); // Stop checking
        } else {
            let $stillValidTimestamp = new Date().getTime();
            console.log('Cookies are still valid after ' + ($stillValidTimestamp - $startTimestamp) + 's');
        }
    }, 60000); // Check every 1 minute
}

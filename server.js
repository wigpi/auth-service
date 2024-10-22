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
const MAX_RETRIES = parseInt(process.env.AUTH_MAX_RETRIES, 10) || 3;

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

async function authenticateUser($username, $password, retries = MAX_RETRIES) {
    let context;
    let page;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Attempt ${attempt}: Authenticating user ${$username}...`);
            
            // Create a new incognito context and page
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

            // Navigate to the login page and perform login
            await page.goto(process.env.CAS_LOGIN_URL, { waitUntil: 'domcontentloaded' });
            await page.type('input[name=username]', $username);
            await page.type('input[name=password]', $password);
            await page.click('button[type=submit]');

            // Wait for a selector that indicates successful login
            await page.waitForSelector('#DivEntete_Version', { timeout: 5000 });
            const cookies = await page.cookies();

            // Set expiration for cookies and return them
            cookies.forEach(cookie => {
                cookie.expires = new Date().getTime() + 2400000;
            });

            console.log(`User ${$username} authenticated successfully`);
            return { status: 'success', data: { cookies } };

        } catch (error) {
            if (attempt < retries) {
                console.warn(`Attempt ${attempt} failed. Retrying...`);
            } else {
                console.error(`Max retries reached. Failed to authenticate user ${$username}`, error);
                throw new Error('Failed to authenticate after maximum retries');
            }
        } finally {
            if (page) {
                await page.close();
            }
            if (context) {
                await context.close();
            }
        }
    }
}

app.post('/auth', async (req, res) => {
    const $username = req.body.username;
    const $password = req.body.password;

    if (!$username || !$password) {
        return res.status(400).send('Username and password parameters are required');
    }

    try {
        const result = await authenticateUser($username, $password);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(result));
    } catch (error) {
        res.status(500).send('Failed to authenticate, please check your credentials');
    }
});

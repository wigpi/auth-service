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

app.post('/auth', async (req, res) => {
    const $username = req.body.username;
    const $password = req.body.password;
    if (!$username || $username === '' || !$password || $password === '') {
        return res.status(400).send('Username and password parameters are required');
    }
    
    try {
        const browser = await puppeteer.launch({
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
        
        const page = await browser.newPage();
        await page.setRequestInterception(true);

        page.on('request', (req) => {
            if(req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'media') {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        let $return_data = {};
        console.log('Navigating to CAS login page...');
        await page.goto(process.env.CAS_LOGIN_URL, { waitUntil: 'domcontentloaded' });
        await page.type('input[name=username]', $username);
        await page.type('input[name=password]', $password);
        console.log('Clicking submit button...');
        await page.click('button[type=submit]');

        // Wait explicitly for selectors that indicate successful navigation
        await page.waitForSelector('#DivEntete_Version', { timeout: 5000 });
        console.log('Logged in...');
        const cookies = await page.cookies();
        console.log('Getting cookies...');
        // for each cookie set expires to 40 minutes later
        cookies.forEach(cookie => {
            cookie.expires = new Date().getTime() + 2400000;
        });
        $return_data.cookies = cookies;
     
        console.log('Returning data...');
        await browser.close();
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({ status: 'success', data: $return_data }));
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to authenticate, please check your credentials');
    }
});

app.post('/check', async (req, res) => {
    const $cookies = req.body.cookies;
    if (!$cookies || $cookies.length === 0) {
        return res.status(400).send('Cookies parameter is required');
    }

    try {
        const browser = await puppeteer.launch({
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
        
        const page = await browser.newPage();
        await page.setRequestInterception(true);

        page.on('request', (req) => {
            if(req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'media') {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        let $return_data = {};
        console.log('Injecting cookies...');
        await page.setCookie(...$cookies);
        console.log('Cookies injected...');
        console.log('Navigating to CAS login page...');
        // wait for all the possible redirections
        await page.goto(process.env.EDT_URL, { waitUntil: 'networkidle2' });
        
        // check if the domain of the url is cas-p.wigorservices.net or ws-edt-cd.wigorservices.net
        console.log('Checking cookies validity...');
        if (page.url().includes(process.env.CAS_DOMAIN)) {
            console.log('Cookies are invalid...');
            await browser.close();
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: 'fail', data: 'Cookies are invalid' }));
            return;
        }else if(page.url().includes(process.env.EDT_DOMAIN)){
            console.log('Cookies are valid...');
            await browser.close();
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: 'success', data: 'Cookies are valid' }));
            return;
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to check cookies');
    }
});

async function devGetCookiesValidity(){
    fs.unlinkSync('cookies.json');
    const response = await axios.get('http://localhost:3000/auth', {
        data: {
            username: '<your_username>',
            password: '<your_password>'
        }
    });
    let $cookies = response.data.data.cookies;
    const $startTimestamp = new Date().getTime();

    fs.writeFileSync('cookies.json', JSON.stringify($cookies)); // save the cookies to a file

    setInterval(async () => {
        // so post to the check route with the cookies that i will provide
        // const $cookies = 
        // remove cookies.json and generate a new one
        const $cookies = JSON.parse(fs.readFileSync('cookies.json'));
        const response = await axios.post('http://localhost:3000/check', {
            cookies: $cookies
        });
        if (response.data.status === 'fail') {
            console.log('Cookies are invalid');
            let $endTimestamp = new Date().getTime();
            console.log('Cookies duration: ' + ($endTimestamp - $startTimestamp)+'s');
            // break the loop
            clearInterval();
        } else {
            let $stillValidTimestamp = new Date().getTime();
            console.log('Cookies are still valid after ' + ($stillValidTimestamp - $startTimestamp)+'s');
        }
    }, 60000); // 1 minute
}

// devGetCookiesValidity();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const app = express();
const PORT = 3000;
const CAS_URL = 'https://cas-p.wigorservices.net/cas/login?service=https%3A%2F%2Fws-edt-cd.wigorservices.net%2FWebPsDyn.aspx%3Faction%3DposEDTLMS';

app.use(express.json());

app.get('/auth', async (req, res) => {
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
        await page.goto(CAS_URL, { waitUntil: 'domcontentloaded' });
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
        console.log("cookies",cookies);
        $return_data.cookies = cookies;
     
        console.log('Returning data...');
        console.log($return_data);
        // temp, try to get the html content of the page at this url and inject cookies into it : https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?Action=posEDTLMS
        // await page.goto('https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?Action=posEDTLMS', { waitUntil: 'networkidle2' });
        // console.log('Navigating to page...');
        // console.log('Injecting cookies...');
        // await page.setCookie(...cookies);
        // console.log('Cookies injected...');
        // console.log('Returning data...');
        // // console.log the html content of the page
        // // console.log(await page.content());
        // // save to test.html
        // fs.writeFileSync('test.html', await page.content());
        await browser.close();
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({ status: 'success', data: $return_data }));
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to authenticate');
    }
});

// now i want a route that takes in param a json object will all the cookies and tries to use them to the cas login page, if they are still valid, it should return the user data otherwise it should return the login form, so in resume, i want a route to check if the cookies are still valid
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
        await page.goto("https://ws-edt-cd.wigorservices.net", { waitUntil: 'networkidle2' });
        
        // check if the domain of the url is cas-p.wigorservices.net or ws-edt-cd.wigorservices.net
        console.log('Checking cookies validity...');
        if (page.url().includes('cas-p.wigorservices.net')) {
            console.log('Cookies are invalid...');
            await browser.close();
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: 'fail', data: 'Cookies are invalid' }));
            return;
        }else if(page.url().includes('ws-edt-cd.wigorservices.net')){
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

async function getCookiesValidity(){
    // fs.unlinkSync('cookies.json');
    const response = await axios.get('http://localhost:3000/auth', {
        data: {
            username: 'julien.flusin',
            password: 'jul+$FLU41'
        }
    });
    $cookies = response.data.data.cookies;
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
            $endTimestamp = new Date().getTime();
            console.log('Cookies duration: ' + ($endTimestamp - $startTimestamp)+'s');
            // break the loop
            clearInterval();
        } else {
            $stillValidTimestamp = new Date().getTime();
            console.log('Cookies are still valid after ' + ($stillValidTimestamp - $startTimestamp)+'s');
        }
    }, 60000); // 1 minute
}

// getCookiesValidity();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
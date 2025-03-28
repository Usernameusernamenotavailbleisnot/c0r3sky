const axios = require('axios');
const fs = require('fs');
const ethers = require('ethers');
const winston = require('winston');
const {HttpsProxyAgent} = require('https-proxy-agent');
const path = require('path');
const chalk = require('chalk');

// Custom formatter for colorized console output
const consoleFormat = winston.format.printf(({ level, message }) => {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // Color based on log level
  let coloredMessage;
  if (message.includes('error') || message.includes('failed') || message.includes('Error')) {
    coloredMessage = chalk.red(message);
  } else if (message.includes('successful') || message.includes('success')) {
    coloredMessage = chalk.green(message);
  } else if (message.includes('Processing') || message.includes('Retrying')) {
    coloredMessage = chalk.blue(message);
  } else if (message.includes('score') || message.includes('Day')) {
    coloredMessage = chalk.yellow(message);
  } else if (message.includes('Waiting') || message.includes('scheduled')) {
    coloredMessage = chalk.magenta(message);
  } else {
    coloredMessage = chalk.white(message);
  }
  
  return `${chalk.gray(`[${timestamp}]`)} ${coloredMessage}`;
});

// Configure Winston logger
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        consoleFormat
      ),
    }),
    new winston.transports.File({ 
      filename: 'coresky.log',
      format: winston.format.printf(info => {
        return `[${new Date().toISOString().replace('T', ' ').substring(0, 19)}] ${info.message}`;
      })
    })
  ]
});

// Read proxies and private keys
const readLines = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    logger.error(`Error reading file ${filePath}: ${error.message}`);
    return [];
  }
};

// Mask sensitive information in proxy URL
const maskProxy = (proxyUrl) => {
  try {
    if (!proxyUrl || typeof proxyUrl !== 'string') return 'invalid-proxy';
    
    // For proxy URLs with authentication
    if (proxyUrl.includes('@')) {
      // Format: http://username:password@host:port
      const [protocol, rest] = proxyUrl.split('://');
      const [auth, hostPort] = rest.split('@');
      
      // Return masked version
      return `${protocol}://****:****@${hostPort}`;
    }
    
    // For proxy URLs without authentication, return as is
    return proxyUrl;
  } catch (error) {
    return 'masked-proxy';
  }
};

// CoreSky API endpoints
const CORESKY_API = {
  BASE_URL: 'https://www.coresky.com',
  LOGIN: '/api/user/login',
  SIGN: '/api/taskwall/meme/sign',
  SCORE: '/api/user/score/detail'
};

// Create axios instance with proxy
const createAxiosInstance = (proxy) => {
  const config = {
    baseURL: CORESKY_API.BASE_URL,
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'hearder_gray_set': '0',
      'origin': 'https://www.coresky.com',
      'referer': 'https://www.coresky.com/tasks-rewards',
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
    },
    timeout: 30000 // 30 second timeout
  };

  if (proxy) {
    try {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    } catch (error) {
      logger.error(`Invalid proxy format: ${proxy}. Error: ${error.message}`);
    }
  }

  return axios.create(config);
};

// Generate signature from private key
const generateSignature = async (privateKey) => {
  try {
    const wallet = new ethers.Wallet(privateKey);
    
    // Ensure exact message format with precise capitalization and line breaks
    // Capitalize the wallet address exactly as shown in the error
    const checksumAddress = ethers.getAddress(wallet.address);
    
    // Format exactly as provided, including all line breaks
    const messageToSign = `Welcome to CoreSky!

Click to sign in and accept the CoreSky Terms of Service.

This request will not trigger a blockchain transaction or cost any gas fees.

Your authentication status will reset after 24 hours.

Wallet address:

${checksumAddress}`;
    
    const signature = await wallet.signMessage(messageToSign);
    return { address: checksumAddress, signature };
  } catch (error) {
    throw new Error(`Error generating signature: ${error.message}`);
  }
};

// Login to CoreSky with retry
const login = async (privateKey, proxy, retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    // Generate signature
    const { address, signature } = await generateSignature(privateKey);
    const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    logger.info(`🔑 Processing wallet: ${shortAddress}`);
    
    // Create axios instance with proxy
    const api = createAxiosInstance(proxy);
    
    // Login - IMPORTANT: Order of properties in the payload matches the example
    const loginPayload = {
      "address": address,
      "signature": signature,
      "refCode": "aeepcd",
      "projectId": "0"
    };
    
    // Login request
    const loginResponse = await api.post(CORESKY_API.LOGIN, loginPayload);
    
    if (loginResponse.data.code !== 200) {
      throw new Error(`Login failed: ${loginResponse.data.message}`);
    }
    
    const token = loginResponse.data.debug.token;
    logger.info(`🔓 Login successful for ${shortAddress}`);
    
    return { api, address, token, shortAddress };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      const delay = Math.pow(2, nextRetry) * 1000; // Exponential backoff
      
      // Mask private key for logs
      const maskedKey = privateKey.substring(0, 6) + '...' + privateKey.substring(privateKey.length - 4);
      logger.error(`❌ Login error for ${maskedKey}: ${error.message}`);
      logger.info(`🔄 Retrying login (${nextRetry}/${MAX_RETRIES}) in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return login(privateKey, proxy, nextRetry);
    }
    
    throw error; // Propagate error after max retries
  }
};

// Daily sign-in with retry
const dailySignIn = async (api, address, shortAddress, retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    // Daily sign-in
    const signResponse = await api.post(CORESKY_API.SIGN);
    
    if (signResponse.data.code !== 200) {
      throw new Error(`Sign-in failed: ${signResponse.data.message}`);
    }
    
    const isSignedIn = signResponse.data.debug.isSign === 1;
    const signDay = signResponse.data.debug.signDay;
    logger.info(`📝 Daily sign-in ${isSignedIn ? 'successful' : 'failed'} (Day ${signDay}) for ${shortAddress}`);
    
    return { isSignedIn, signDay };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      const delay = Math.pow(2, nextRetry) * 1000; // Exponential backoff
      
      logger.error(`❌ Sign-in error for ${shortAddress}: ${error.message}`);
      logger.info(`🔄 Retrying sign-in (${nextRetry}/${MAX_RETRIES}) in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return dailySignIn(api, address, shortAddress, nextRetry);
    }
    
    throw error; // Propagate error after max retries
  }
};

// Check score with retry
const checkScore = async (api, address, shortAddress, retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    // Get score detail - IMPORTANT: Keep property order consistent with the example
    const scorePayload = {
      "page": 1,
      "limit": 10,
      "address": address.toLowerCase()
    };
    
    const scoreResponse = await api.post(CORESKY_API.SCORE, scorePayload);
    
    if (scoreResponse.data.code !== 200) {
      throw new Error(`Score check failed: ${scoreResponse.data.message}`);
    }
    
    const score = scoreResponse.data.debug.score;
    logger.info(`💰 Current score for ${shortAddress}: ${score}`);
    
    return { score };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      const delay = Math.pow(2, nextRetry) * 1000; // Exponential backoff
      
      logger.error(`❌ Score check error for ${shortAddress}: ${error.message}`);
      logger.info(`🔄 Retrying score check (${nextRetry}/${MAX_RETRIES}) in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return checkScore(api, address, shortAddress, nextRetry);
    }
    
    throw error; // Propagate error after max retries
  }
};

// CoreSky check-in process with targeted retry logic
const performCheckIn = async (privateKey, proxy) => {
  let walletAddress = "unknown";
  let shortAddress = "unknown";
  
  try {
    // Step 1: Login
    const loginResult = await login(privateKey, proxy);
    const { api, address, token } = loginResult;
    walletAddress = address;
    shortAddress = loginResult.shortAddress;
    
    // Add token to headers exactly as in the example
    api.defaults.headers.common['token'] = token;
    
    // Step 2: Daily sign-in
    const signResult = await dailySignIn(api, address, shortAddress);
    
    // Step 3: Check score
    const scoreResult = await checkScore(api, address, shortAddress);
    
    return {
      success: true,
      address: walletAddress,
      isSignedIn: signResult.isSignedIn,
      signDay: signResult.signDay,
      score: scoreResult.score
    };
  } catch (error) {
    // Mask private key for security
    const maskedKey = privateKey.substring(0, 6) + '...' + privateKey.substring(privateKey.length - 4);
    logger.error(`❌ Check-in process failed for ${maskedKey}: ${error.message}`);
    
    // Try to get wallet address if not already extracted
    if (walletAddress === "unknown") {
      try {
        const wallet = new ethers.Wallet(privateKey);
        walletAddress = wallet.address;
        shortAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
      } catch (walletError) {
        logger.error(`Could not extract wallet address: ${walletError.message}`);
      }
    }
    
    return {
      success: false,
      address: walletAddress,
      error: error.message
    };
  }
};

// Main function to process all accounts
const main = async () => {
  logger.info('✨ Starting CoreSky daily check-in process ✨');
  
  const privateKeys = readLines(path.join(__dirname, 'pk.txt'));
  const proxies = readLines(path.join(__dirname, 'proxy.txt'));
  
  if (privateKeys.length === 0) {
    logger.error('❌ No private keys found. Please check pk.txt');
    return;
  }
  
  if (proxies.length === 0) {
    logger.error('❌ No proxies found. Please check proxy.txt');
    return;
  }
  
  if (privateKeys.length !== proxies.length) {
    logger.warn(`⚠️ Number of private keys (${privateKeys.length}) doesn't match number of proxies (${proxies.length}). Using available pairs.`);
  }
  
  const pairs = Math.min(privateKeys.length, proxies.length);
  
  for (let i = 0; i < pairs; i++) {
    const privateKey = privateKeys[i].trim();
    const proxy = proxies[i].trim();
    
    logger.info(`🔄 Processing account ${i + 1}/${pairs}`);
    
    try {
      const result = await performCheckIn(privateKey, proxy);
      
      if (result.success) {
        logger.info(`✅ Check-in successful for account ${i + 1}/${pairs}`);
      } else {
        logger.error(`❌ Check-in failed for account ${i + 1}/${pairs}: ${result.error}`);
      }
    } catch (error) {
      logger.error(`⚠️ Unexpected error with account ${i + 1}/${pairs}: ${error.message}`);
    }
    
    // Add delay between accounts to avoid rate limiting
    if (i < pairs - 1) {
      const delay = 5000; // 5 seconds
      logger.info(`⏳ Waiting ${delay / 1000} seconds before next account...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  logger.info('🎉 CoreSky daily check-in process completed 🎉');
};

// Schedule function to run every 24.5 hours
const runSchedule = async () => {
  try {
    await main();
  } catch (error) {
    logger.error(`❌ Schedule error: ${error.message}`);
  }
  
  // Schedule next run (24.5 hours)
  const nextRun = 24.5 * 60 * 60 * 1000;
  
  // Calculate next run time
  const nextDate = new Date(Date.now() + nextRun);
  const formattedNextDate = nextDate.toLocaleString();
  
  logger.info(`⏰ Next run scheduled in 24.5 hours (${formattedNextDate})`);
  setTimeout(runSchedule, nextRun);
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`💥 Uncaught exception: ${error.message}`);
  logger.error(error.stack);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`💥 Unhandled rejection at: ${promise}, reason: ${reason}`);
});

// Display a nice startup banner
const displayBanner = () => {
  console.log('\n' + chalk.cyan('================================'));
  console.log(chalk.yellow('     CORESKY CHECK-IN BOT'));
  console.log(chalk.cyan('================================') + '\n');
}

// Start the program
displayBanner();
logger.info('🚀 CoreSky check-in script initialized');
runSchedule();

# c0r3sky

An automated tool for c0r3sky daily check-in process.

## Features

- 🔄 Automatic daily check-ins
- 🔑 Multiple account support
- 🌐 Proxy support for each account
- 📊 Score checking
- 📝 Detailed logging
- ⏱️ Scheduled execution (every 24.5 hours)
- 🔁 Robust retry logic

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/Usernameusernamenotavailbleisnot/c0r3sky.git
   cd c0r3sky
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Configuration

The application requires two configuration files:

1. `pk.txt` - Contains Ethereum private keys (one per line)
2. `proxy.txt` - Contains proxy URLs (one per line)

### Private Keys Format

Each line in `pk.txt` should contain one private key:

```
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
```

### Proxy Format

Each line in `proxy.txt` should contain one proxy URL:

```
http://username:password@host:port
http://username:password@host:port
```

> ⚠️ **Important**: The number of private keys should match the number of proxies, as they will be paired in order.

## Usage

Start the application:

```
npm start
```

Or run it directly:

```
node index.js
```

The application will:
1. Start the check-in process for all configured accounts
2. Display colorized logs in the console
3. Save detailed logs to `c0r3sky.log`
4. Automatically schedule the next run in 24.5 hours

## Logging

The application uses Winston for logging with two outputs:
- Console (with colorized output)
- File (`c0r3sky.log`)

Log entries include timestamps and color-coded messages based on the content.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is for educational and testing purposes only. Use at your own risk on testnet environments. The authors are not responsible for any potential loss of funds or other damages.

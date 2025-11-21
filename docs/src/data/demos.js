export const DEMOS = [
    {
        id: 'weather',
        label: 'Weather',
        prompt: "Check the weather in 5 cities and calculate the average temperature.",
        standardSteps: [
            { type: 'thinking', content: 'I need to check the weather for 5 cities.' },
            { type: 'tool-call', content: 'get_weather(city="London")' },
            { type: 'partial-result', content: '15°C, Cloudy' },
            { type: 'thinking', content: 'Now checking New York.' },
            { type: 'tool-call', content: 'get_weather(city="New York")' },
            { type: 'partial-result', content: '22°C, Sunny' },
            { type: 'thinking', content: 'Checking Tokyo next.' },
            { type: 'tool-call', content: 'get_weather(city="Tokyo")' },
            { type: 'partial-result', content: '18°C, Rain' },
            { type: 'thinking', content: 'Checking Paris.' },
            { type: 'tool-call', content: 'get_weather(city="Paris")' },
            { type: 'partial-result', content: '16°C, Clear' },
            { type: 'thinking', content: 'Finally, checking Berlin.' },
            { type: 'tool-call', content: 'get_weather(city="Berlin")' },
            { type: 'partial-result', content: '14°C, Cloudy' },
            { type: 'thinking', content: 'Calculating average: (15+22+18+16+14)/5 = 17.' },
            { type: 'result', content: 'The average temperature is 17°C.' }
        ],
        optimizedSteps: [
            { type: 'thinking', content: 'I will use run_js to fetch all weather data and calculate the average in one go.' },
            {
                type: 'tool-call', language: 'javascript', content: `const cities = ['London', 'New York', 'Tokyo', 'Paris', 'Berlin'];
const temps = await Promise.all(
 cities.map(c => mcp.getWeather(c))
);
temps.reduce((a, b) => a + b, 0) / temps.length;` },
            { type: 'result', content: '17' }
        ]
    },
    {
        id: 'stocks',
        label: 'Stocks',
        prompt: "Get the latest price for AAPL, GOOGL, and MSFT, then find the highest performer.",
        standardSteps: [
            { type: 'thinking', content: 'I need to fetch stock prices for 3 companies.' },
            { type: 'tool-call', content: 'get_stock_price(symbol="AAPL")' },
            { type: 'partial-result', content: '$150.00' },
            { type: 'thinking', content: 'Now checking GOOGL.' },
            { type: 'tool-call', content: 'get_stock_price(symbol="GOOGL")' },
            { type: 'partial-result', content: '$2800.00' },
            { type: 'thinking', content: 'Checking MSFT.' },
            { type: 'tool-call', content: 'get_stock_price(symbol="MSFT")' },
            { type: 'partial-result', content: '$300.00' },
            { type: 'thinking', content: 'Comparing prices to find the highest.' },
            { type: 'result', content: 'GOOGL is the highest performer at $2800.00.' }
        ],
        optimizedSteps: [
            { type: 'thinking', content: 'I will use run_js to fetch all prices and compare them.' },
            {
                type: 'tool-call', language: 'javascript', content: `const symbols = ['AAPL', 'GOOGL', 'MSFT'];
const prices = await Promise.all(
 symbols.map(s => mcp.getStockPrice(s))
);
const maxPrice = Math.max(...prices);
const maxSymbol = symbols[prices.indexOf(maxPrice)];
return \`\${maxSymbol} is the highest at \$\${maxPrice}\`;` },
            { type: 'result', content: 'GOOGL is the highest at $2800' }
        ]
    },
    {
        id: 'research',
        label: 'Research',
        prompt: "Search for 'latest react features', read the top 3 articles, and summarize them.",
        standardSteps: [
            { type: 'thinking', content: 'First, I need to search for the topic.' },
            { type: 'tool-call', content: 'search_google(query="latest react features")' },
            { type: 'partial-result', content: '[Link1, Link2, Link3]' },
            { type: 'thinking', content: 'Reading first article...' },
            { type: 'tool-call', content: 'read_url(url="Link1")' },
            { type: 'partial-result', content: 'Content of Link1...' },
            { type: 'thinking', content: 'Reading second article...' },
            { type: 'tool-call', content: 'read_url(url="Link2")' },
            { type: 'partial-result', content: 'Content of Link2...' },
            { type: 'thinking', content: 'Reading third article...' },
            { type: 'tool-call', content: 'read_url(url="Link3")' },
            { type: 'partial-result', content: 'Content of Link3...' },
            { type: 'thinking', content: 'Summarizing all content.' },
            { type: 'result', content: 'React 19 introduces Actions, new hooks like use(), and compiler improvements.' }
        ],
        optimizedSteps: [
            { type: 'thinking', content: 'I will use run_js to search, read, and summarize in parallel.' },
            {
                type: 'tool-call', language: 'javascript', content: `const results = await mcp.search("latest react features");
const contents = await Promise.all(
  results.slice(0, 3).map(r => mcp.readUrl(r.url))
);
return mcp.summarize(contents.join('\\n'));` },
            { type: 'result', content: 'React 19 features: Actions, use() hook, Compiler.' }
        ]
    }
];

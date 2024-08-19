import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { neynar } from "frog/middlewares";
import { handle } from "frog/vercel";
import { Box, Column, Image, Text, vars } from "../lib/ui.js";
import { moxieSmartContract, moxieBondingCurveSmartContract } from "../lib/contracts.js";
import { gql, GraphQLClient } from "graphql-request";
import { init, fetchQuery } from "@airstack/node";
import { formatUnits } from "viem";
import dotenv from 'dotenv';


// Load environment variables from .env file
dotenv.config();

export const app = new Frog({
  assetsPath: "/",
  basePath: "/api/frame",
  ui: { vars },
  browserLocation: "",
  imageAspectRatio: "1:1",
  hub: {
    apiUrl: "https://hubs.airstack.xyz",
    fetchOptions: {
      headers: {
        "x-airstack-hubs": process.env.AIRSTACK_API_KEY || '',
      }
    }
  },
  headers: {
    "cache-control":
      "no-store, no-cache, must-revalidate, proxy-revalidate max-age=0, s-maxage=0",
  },
  imageOptions: {
    height: 1024,
    width: 1024,
  },
  title: "Fan Tokens Rewards",
}).use(
  neynar({
    apiKey: process.env.NEYNAR_API_KEY || "NEYNAR_API_DOCS",
    features: ["interactor", "cast"],
  })
);

// Initialize the GraphQL client
const graphQLClient = new GraphQLClient(
  "https://api.studio.thegraph.com/query/23537/moxie_protocol_stats_mainnet/version/latest"
);

// Initialize Airstack with API key
init(process.env.AIRSTACK_API_KEY || '');

async function getTokenBalance(ownerAddress: string) {
  const hexBalance = await moxieSmartContract.read.balanceOf([
    ownerAddress as `0x${string}`,
  ]);
  const decimalBalance = BigInt(hexBalance).toString();
  const tokenBalanceInMoxie = formatUnits(BigInt(decimalBalance), 18);
  return tokenBalanceInMoxie;
}

async function getMoxieBalanceInUSD() {
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-cg-demo-api-key": "CG-xYGQqBU93QcE7LW14fhd953Z	",
    },
  };

  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=moxie&vs_currencies=usd",
    options
  );
  const data = await response.json();
  return data.moxie.usd;
}

app.frame("/", async (c) => {
  return c.res({
    image: (
      <Box
        gap="16"
        grow
        flexDirection="column"
        background="white"
        height="100%"
        padding="48"
      >
        <Box>
          <img src="/moxielogo.png" width="200" height="50" />
        </Box>
        <Box
          grow
          alignContent="center"
          justifyContent="center"
          alignHorizontal="center"
          alignVertical="center"
          gap="16"
        >
          <Box
            backgroundColor="modal"
            padding-left="18"
            padding-right="18"
            padding-bottom="18"
            padding-top="18"
          >
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              Reward your Fans
            </Text>
          </Box>
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            buy and burn moxie to reward fans
          </Text>
        </Box>
      </Box>
    ),
    intents: [
      <TextInput placeholder="Search for a user or channel" />,
      <Button action="/search-user-channel">Search 🔎 </Button>,
    ],
  });
});


app.frame("/search-user-channel", async (c) => {
  const { inputText } = c;  // Capture the user input from the TextInput

  // Determine whether the inputText is a valid fid or cid
  const isChannel = (inputText ?? "").startsWith("cid:");
  const isFan = (inputText ?? "").startsWith("fid:");

  if (!isChannel && !isFan) {
    // Return an error response if the format is incorrect
    return c.error({
      message: "Invalid input format. Please use `fid:<FID>` or `cid:<Channel Name>`.",
    });
  }

  // Ensure the fanTokenSymbol is correctly prefixed
  const fanTokenSymbol = isChannel ? inputText : isFan ? inputText : `fid:${inputText}`;

  // Define the GraphQL query for the search
  const searchQuery = gql`
    query GetToken($fanTokenSymbol: String) {
      subjectTokens(where: {symbol: $fanTokenSymbol}) {
        id
        name
        symbol
        currentPriceInMoxie
        subject {
          id
        }
      }
    }
  `;
  
  // Execute the query with the correct symbol (fid or cid)
  try {
    const variables = { fanTokenSymbol };
    const dataFanToken: any = await graphQLClient.request(searchQuery, variables);
    const tokenDetails = dataFanToken.subjectTokens[0];

    console.log(`Search Results for ${inputText}`);

    if (!tokenDetails) {
      // If no tokenDetails are found, return an error message
      return c.error({
        message: `No results found for ${inputText}.`,
      });
    }

    // Destructure the tokenDetails to extract individual variables
    const { id, subject } = tokenDetails;

    const subjectId = subject?.id;

    return c.res({
      image: `/img-seach-user-channel/${fanTokenSymbol}`,
      intents: [
        <Button action={`/check-moxie-amount/${subjectId}`}>Check amount to reward</Button>,
      ],
    });
  } catch (error) {
    console.error("Error fetching data:", error);

    return c.error({
      message: "No results found for the user or channel.",
    });
  }
});


app.image("/img-seach-user-channel/:fanTokenSymbol", async (c) => {
  const { fanTokenSymbol } = c.req.param();

  // Determine whether the input is a channel or a fan token
  const isChannel = fanTokenSymbol.startsWith("cid:");
  const isFan = fanTokenSymbol.startsWith("fid:");

  // Ensure the fanTokenSymbol is correctly prefixed
  const formattedSymbol = isChannel
    ? fanTokenSymbol.slice(4) // Remove 'cid:' prefix
    : isFan
    ? fanTokenSymbol.slice(4) // Remove 'fid:' prefix
    : fanTokenSymbol;

  // Define the GraphQL query for the search
  const searchQuery = gql`
    query GetToken($fanTokenSymbol: String) {
      subjectTokens(where: {symbol: $fanTokenSymbol}) {
        id
        name
        symbol
        currentPriceInMoxie
        subject {
          id
        }
      }
    }
  `;

  const variables = { fanTokenSymbol };
  const dataFanToken: any = await graphQLClient.request(searchQuery, variables);
  const tokenDetails = dataFanToken.subjectTokens[0];

  console.log(`Search Results for ${fanTokenSymbol}`);

  // Destructure the tokenDetails to extract individual variables
  const { id, name, symbol, currentPriceInMoxie, subject } = tokenDetails;

  // Log each variable
  console.log(`ID: ${id}`);
  console.log(`Name: ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Current Price in Moxie: ${currentPriceInMoxie}`);
  console.log(`Subject ID: ${subject?.id}`);

  // Initialize imageFanToken
  let imageFanToken: string | null = null;

  if (isChannel) {
    // Define the GraphQL query to search for the channel image by CID
    const searchChannelImageByCid = `
      query SearchChannelImageByCid {
        FarcasterChannels(
          input: {blockchain: ALL, filter: {channelId: {_eq: "${formattedSymbol}"}}}
        ) {
          FarcasterChannel {
            imageUrl
          }
        }
      }
    `;

    // Fetch the channel image URL
    const response = await fetchQuery(searchChannelImageByCid);
    
    const data = response?.data;

    // Check if FarcasterChannels exists and has at least one result
    imageFanToken = data?.FarcasterChannels?.FarcasterChannel?.[0]?.imageUrl;

    if (imageFanToken) {
      console.log(`Channel Image URL: ${imageFanToken}`);
    } else {
      console.log(`No image found for channel ${name}`);
    }
  } else if (isFan) {
    // Define the GraphQL query to search for the user image by FID
    const searchUserImageByFid = `
      query SearchUserImageByFid {
        Socials(
          input: {filter: {dappName: {_eq: farcaster}, userId: {_eq: "${formattedSymbol}"}}, blockchain: ethereum}
        ) {
          Social {
            profileImage
          }
        }
      }
    `;

    // Fetch the user image URL
    const response = await fetchQuery(searchUserImageByFid);
    
    const data = response?.data;

    // Check if Socials exists and has at least one result
    imageFanToken = data?.Socials?.Social?.[0]?.profileImage;

    if (imageFanToken) {
      console.log(`User Image URL: ${imageFanToken}`);
    } else {
      console.log(`No image found for user ${name}`);
    }
  }

  return c.res({
    image: (
      <Box
        gap="16"
        grow
        flexDirection="column"
        background="white"
        height="100%"
        padding="48"
      >
        <Box>
          <img src="/moxielogo.png" width="200" height="50" />
        </Box>
        <Box
          grow
          alignContent="center"
          justifyContent="center"
          alignHorizontal="center"
          alignVertical="center"
          gap="16"
        >
          <Box backgroundColor="modal" padding-left="18" paddingRight="18">

            <img
                  height="200"
                  width="200"
                  src={imageFanToken ?? ""}
                  style={{
                    borderRadius: "50%",
                  }}
                />

          </Box>
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            {name}
          </Text>
          <Box backgroundColor="modal" padding-left="18" paddingRight="18">
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              564 fans
            </Text>
          </Box>
          {/* <Text
            size="20"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            Your Balance:
          </Text>
          <Box display="flex" flexDirection="row" gap="16">
            <Text color="fontcolor" font="subtitle_moxie" align="center">
              Wallet: (0x85…rt748)
            </Text>
            <Box
              backgroundColor="modal"
              paddingLeft="18"
              paddingRight="18"
              borderRadius="80"
            >
              <Text color="fontcolor" font="subtitle_moxie" align="center">
                M 2,345,75{" "}
              </Text>
            </Box>
          </Box> */}
        </Box>
      </Box>
    ),
  });
});



app.frame("/check-moxie-amount/:subjectId", async (c) => {
  const { subjectId } = c.req.param();
  const verifiedAddresses = c.var.interactor;

  // Initialize variables
  let maxBalance = 0;
  let totalBalance = 0;
  let totalMoxieInUSD = '';

  // Arrays to store balances and addresses with the maximum balance
  const addressBalances = [];
  const highestBalanceAddresses = [];

  // Get balance for each address and find the maximum balance
  for (const address of verifiedAddresses?.verifiedAddresses.ethAddresses ?? []) {
    const balance = parseFloat(await getTokenBalance(address)); // Ensure balance is a number
    addressBalances.push({ address, balance });
    maxBalance = Math.max(maxBalance, balance);
  }

  // Identify addresses with the highest balance
  for (const { address, balance } of addressBalances) {
    if (balance === maxBalance) {
      highestBalanceAddresses.push(address);
      totalBalance += balance; // Accumulate balance for addresses with the maximum balance
    }
  }

  // Log addresses with the highest balance
  console.log(`Addresses with the highest balance (${maxBalance}):`, highestBalanceAddresses);

  // Calculate the total value in USD
  const balanceInUSD = await getMoxieBalanceInUSD();
  totalMoxieInUSD = (totalBalance * balanceInUSD).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format the number with commas and two decimal places
  const totalMoxieBalance = totalBalance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const address = highestBalanceAddresses[0];

  const allowance = await moxieSmartContract.read.allowance([
    address as `0x${string}`,
    moxieBondingCurveSmartContract.address,
  ]);

  console.log(`Allowance for ${address}: ${allowance}`);

  // Check if allowance is not unlimited
  const isAllowanceFinite = BigInt(allowance) < BigInt('100000000000000000000000000000000'); // Example threshold

  // Determine intents based on allowance
  const intents = isAllowanceFinite ? [
    <Button.Transaction target="/approve" action={`/check-moxie-amount/${subjectId}`}>Approve</Button.Transaction>,
  ] : [
    <TextInput placeholder="Amount of MOXIE to reward" />,
    <Button.Transaction target="/buy" action={`/check-moxie-amount/${subjectId}`}>Reward 100%</Button.Transaction>,
    <Button action="/share-amount">Reward selected</Button>,
  ];

  return c.res({
    image: `/img-moxie-amount/${totalMoxieBalance}/${totalMoxieInUSD}`,
    intents,
  });
});


app.image("/img-moxie-amount/:totalMoxieBalance/:totalMoxieInUSD", async (c) => {
  const { totalMoxieBalance, totalMoxieInUSD } = c.req.param();

  return c.res({
    image: (
      <Box
        gap="16"
        grow
        flexDirection="column"
        background="white"
        height="100%"
        padding="48"
      >
        <Box>
          <img src="/moxielogo.png" width="200" height="50" />
        </Box>
        <Box
          grow
          alignContent="center"
          justifyContent="center"
          alignHorizontal="center"
          alignVertical="center"
          gap="16"
        >
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            You have
          </Text>
          <Box backgroundColor="modal" paddingLeft="18" paddingRight="18">
            <Text size="64" color="fontcolor" font="title_moxie" align="center">
              {totalMoxieInUSD}
            </Text>
          </Box>
          <Box backgroundColor="modal" padding-left="18" paddingRight="18">
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              {totalMoxieBalance} MOXIES
            </Text>
          </Box>
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            to reward
          </Text>
        </Box>
      </Box>
    ),
  });
});


app.transaction('/approve', async (c, next) => {
  await next();
  const txParams = await c.res.json();
  txParams.attribution = false;
  console.log(txParams);
  c.res = new Response(JSON.stringify(txParams), {
    headers: {
      "Content-Type": "application/json",
    },
  });
},
async (c) => {
  return c.contract({
    abi: moxieSmartContract.abi,
    chainId: 'eip155:8453',
    functionName: 'approve',
    args: [moxieBondingCurveSmartContract.address, BigInt(100000000000000000000000000000000000000000000000000n)],
    to: moxieSmartContract.address,
  })
})


// app.transaction('/approve', async (c, next) => {
//   await next();
//   const txParams = await c.res.json();
//   txParams.attribution = false;
//   console.log(txParams);
//   c.res = new Response(JSON.stringify(txParams), {
//     headers: {
//       "Content-Type": "application/json",
//     },
//   });
// },
// async (c) => {
//   const { inputText, address } = c;
//   const inputValue = inputText ? parseFloat(inputText) : 0;

//   const tokenDecimalPrecision = 18;
//   const amountInWei = inputValue * Math.pow(10, tokenDecimalPrecision);



//   return c.contract({
//     chainId: 'eip155:42161',
//     to: quote.to,
//     data: quote.data,
//     value: quote.value,
//   })
// })


//Frame to share moxie
app.frame("/share-amount", async (c) => {
  const verifiedAddresses = c.var.interactor;

  return c.res({
    image: (
      <Box
        gap="16"
        grow
        flexDirection="column"
        background="white"
        height="100%"
        padding="48"
      >
        <Box>
          <img src="/moxielogo.png" width="200" height="50" />
        </Box>
        <Box
          grow
          alignContent="center"
          justifyContent="center"
          alignHorizontal="center"
          alignVertical="center"
          gap="16"
        >
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            I just burned
          </Text>
          <Box backgroundColor="modal" padding-left="18" paddingRight="18">
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              2,345,75 MOXIES
            </Text>
          </Box>
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            for reward 564
          </Text>
          <Box backgroundColor="modal" padding-left="18" paddingRight="18">
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              0x94t3z fans
            </Text>
          </Box>
        </Box>
      </Box>
    ),
    intents: [
      <Button action="/">Share</Button>,
      <Button action="/">Buy Moxie </Button>,
    ],
  });
});

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);

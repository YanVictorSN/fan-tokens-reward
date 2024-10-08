import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { neynar } from "frog/middlewares";
import { handle } from "frog/vercel";
import { 
  Box,
  Text, 
  vars 
} from "../lib/ui.js";
import { 
  moxieSmartContract, 
  moxieBondingCurveSmartContract 
} from "../lib/contracts.js";
import { gql, GraphQLClient } from "graphql-request";
import { init, fetchQuery } from "@airstack/node";
import { formatUnits, decodeFunctionData } from "viem";
import { publicClient } from "../lib/viem.js";
import dotenv from 'dotenv';


// Load environment variables from .env file
dotenv.config();


const baseUrl = "https://warpcast.com/~/compose";
const text = "Buy & burn your Fan Tokens to reward your fans!\n\nFrame by @0x94t3z.eth & @thenumb.eth";
const embedUrl = "https://moxie.0x94t3z.tech/api/frame";

const CAST_INTENS = `${baseUrl}?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(embedUrl)}`;


export const app = new Frog({
  assetsPath: "/",
  basePath: "/api/frame",
  ui: { vars },
  browserLocation: CAST_INTENS,
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
      "x-cg-demo-api-key": process.env.CG_API_KEY || "CG-xYGQqBU93QcE7LW14fhd953Z",
    },
  };

  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=moxie&vs_currencies=usd",
    options
  );
  const data = await response.json();
  return data.moxie.usd;
}


async function getTokenDetails(fanTokenSymbol: string) {
  // Search Fan Token by fid or cid
  const searchQuery = gql`
    query GetToken($fanTokenSymbol: String) {
      subjectTokens(where: { symbol: $fanTokenSymbol }) {
        id
        name
        symbol
        uniqueHolders
        subject {
          id
        }
      }
    }
  `;

  const variables = { fanTokenSymbol };
  try {
    const dataFanToken: any = await graphQLClient.request(searchQuery, variables);
    return dataFanToken.subjectTokens[0];
  } catch (error) {
    console.error("Error fetching token details:", error);
    throw error;
  }
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
          textAlign="center"
        >
          <Box
            backgroundColor="modal"
            padding-left="18"
            padding-right="18"
            padding-bottom="8"
            borderRadius="8"
          >
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              Reward your Fans
            </Text>
          </Box>
          <Text
            size="24"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            Buy & burn your Fan Tokens to reward your fans!
          </Text>
        </Box>
      </Box>
    ),
    intents: [
      <TextInput placeholder="Search for a user or channel" />,
      <Button action="/check-by-user">Check yours! </Button>,
      <Button action="/search-user-channel">Search 🔎 </Button>,
    ],
  });
});


app.frame("/check-by-user", async (c) => {
  const fid = c.var.interactor;

  const farcasterId = fid?.fid;

  const fanTokenSymbol = `fid:${farcasterId}`;
  
  // Execute the query with the correct fid
  try {
    const tokenDetails = await getTokenDetails(fanTokenSymbol || "");

    console.log(`Search Results for ${fanTokenSymbol}`);

    if (!tokenDetails) {
      // If no tokenDetails are found, return an error message
      return c.error({
        message: `There are no Fan Token for ${fid?.username}!`,
      });
    }

    return c.res({
      image: `/img-search-user-channel/${fanTokenSymbol}`,
      intents: [
        <Button action={`/check-moxie-amount/${fanTokenSymbol}`}>Check amount to reward</Button>,
      ],
    });
  } catch (error) {
    console.error("Error fetching data:", error);

    return c.error({
      message: "There are no Fan Token for @${fid?.username}!",
    });
  }
});


app.frame("/search-user-channel", async (c) => {
  const { inputText } = c;

  // Query to search for the Farcaster user by username
  const searchFarcasterUserByUsername = `
    query SearchFarcasterUserByUsername {
      Socials(input: {filter: {profileName: {_eq: "${inputText}"}}, blockchain: ethereum}) {
        Social {
          dappName
          profileName
          userId
        }
      }
    }
  `;

  // Fetch the user data
  const userResponse = await fetchQuery(searchFarcasterUserByUsername);
  const userData = userResponse?.data;

  let fanTokenSymbol;

  // Check if user data is found and set the fanTokenSymbol to fid
  if (userData?.Socials?.Social?.length > 0) {
    const farcasterId = userData.Socials.Social[0].userId;
    console.log(farcasterId);
    fanTokenSymbol = `fid:${farcasterId}`;
  } else {
    // Fallback to cid immediately if no user is found
    fanTokenSymbol = `cid:${inputText}`;
  }

  try {
    let tokenDetails = await getTokenDetails(fanTokenSymbol || "");

    // If tokenDetails not found for fid, switch to cid
    if (!tokenDetails && fanTokenSymbol.startsWith("fid:")) {
      console.log(`Token not found for fid, trying cid:${inputText}...`);

      // Retry with cid:{inputText} if fid search fails
      fanTokenSymbol = `cid:${inputText}`;
      tokenDetails = await getTokenDetails(fanTokenSymbol);
    }

    console.log(`Search Results for ${inputText}`);

    if (!tokenDetails) {
      return c.error({
        message: `There are no Fan Token for ${inputText}!`,
      });
    }

    return c.res({
      image: `/img-search-user-channel/${fanTokenSymbol}`,
      intents: [
        <Button action={`/check-moxie-amount/${fanTokenSymbol}`}>
          Check amount to reward
        </Button>,
      ],
    });
  } catch (error) {
    console.error("Error fetching data:", error);

    return c.error({
      message: `Error fetching data ${error}.`,
    });
  }
});


app.image("/img-search-user-channel/:fanTokenSymbol", async (c) => {
  const { fanTokenSymbol } = c.req.param();

  // Determine whether the input is a channel or a fan token
  const isChannel = fanTokenSymbol.startsWith("cid:");
  const isFarcasterID = fanTokenSymbol.startsWith("fid:");

  // Ensure the fanTokenSymbol is correctly prefixed and remove the `cid:` or `fid:` prefix
  const formattedSymbol = isChannel
    ? fanTokenSymbol.slice(4) // Remove 'cid:' prefix
    : isFarcasterID
    ? fanTokenSymbol.slice(4) // Remove 'fid:' prefix
    : fanTokenSymbol;

  let tokenDetails;
  try {
    // Fetch token details using the fanTokenSymbol
    tokenDetails = await getTokenDetails(fanTokenSymbol || "");
  } catch (error) {
    console.error(`Error fetching token details for ${fanTokenSymbol}:`, error);
  }

  console.log(`Search Results for ${fanTokenSymbol}`);

  // Destructure the tokenDetails to extract individual variables
  const { name, uniqueHolders } = tokenDetails || {};

  // Initialize imageFanToken
  let imageFanToken: string | null = null;

  if (isChannel) {
    try {
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
    } catch (error) {
      console.error(`Error fetching channel image: ${error}`);
    }
  } else if (isFarcasterID) {
    try {
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
    } catch (error) {
      console.error(`Error fetching user image: ${error}`);
    }
  }

  // Return the image and token information
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
          <Box backgroundColor="modal" borderRadius="60" boxShadow="0 0 10px rgba(0, 0, 0, 0.1)" >

            <img
              height="200"
              width="200"
              src={imageFanToken ?? ""}
              style={{
                borderRadius: "52%",
              }}
            />

          </Box>
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            {isChannel ? `Channel: ${name}` : name}
          </Text>
          <Box backgroundColor="modal" paddingLeft="18" paddingRight="18" borderRadius="8">
            <Text size="48" color="fontcolor" font="title_moxie" align="center">
              {uniqueHolders} fans
            </Text>
          </Box>
        </Box>
      </Box>
    ),
  });
});


app.frame("/check-moxie-amount/:fanTokenSymbol", async (c) => {
  const { fanTokenSymbol } = c.req.param();
  const verifiedAddresses = c.var.interactor;

  const tokenDetails = await getTokenDetails(fanTokenSymbol || "");

  console.log(`Search Results for ${fanTokenSymbol}`);

  // Destructure the tokenDetails to extract individual variables
  const { subject } = tokenDetails;

  const subjectId = subject?.id;

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

  const walletAddress = highestBalanceAddresses[0];

  const allowance = await moxieSmartContract.read.allowance([
    walletAddress as `0x${string}`,
    moxieBondingCurveSmartContract.address,
  ]);

  console.log(`Allowance for ${walletAddress}: ${allowance}`);

  // Check if allowance is not unlimited
  const isAllowanceFinite = BigInt(allowance) < BigInt('100000000000000000000000000000000'); // Example threshold

  // Determine intents based on allowance
  const intents = isAllowanceFinite ? [
    <Button.Transaction target="/approve" action={`/check-moxie-amount/${fanTokenSymbol}`}>Approve</Button.Transaction>,
  ] : [
    <TextInput placeholder="Amount of MOXIE to reward" />,
    <Button.Transaction target={`/buy-n-burn-all/${subjectId}`} action={`/share-amount/${fanTokenSymbol}`}>Reward 100%</Button.Transaction>,
    <Button.Transaction target={`/buy-n-burn-selected/${subjectId}`} action={`/share-amount/${fanTokenSymbol}`}>Reward selected</Button.Transaction>,
  ];

  return c.res({
    image: `/img-moxie-amount/${totalMoxieInUSD}/${walletAddress}/${totalMoxieBalance}`,
    intents,
  });
});


app.image("/img-moxie-amount/:totalMoxieInUSD/:walletAddress/:totalMoxieBalance", async (c) => {
  const { totalMoxieInUSD, walletAddress, totalMoxieBalance } = c.req.param();

  // Extract the last 4 characters
  const lastPart = walletAddress.slice(-4);

  // Combine them with the "0x" prefix and ellipsis
  const shortenedAddress = `Wallet (0x…${lastPart})`;

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
          <Box backgroundColor="modal" paddingLeft="18" paddingRight="18" borderRadius="8">
            <Text size="64" color="fontcolor" font="title_moxie" align="center">
              {totalMoxieInUSD}
            </Text>
          </Box>
          <Box display="flex" flexDirection="row" gap="12">
            <Text size="16" color="fontcolor" font="subtitle_moxie" align="center">
              {shortenedAddress}
            </Text>
            <Box
              backgroundColor="modal"
              paddingLeft="18"
              paddingRight="18"
              borderRadius="80"
            >
              <Text size="16" color="fontcolor" font="subtitle_moxie" align="center">
                 M {totalMoxieBalance}{" "}
              </Text>
            </Box>
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
    args: [
      moxieBondingCurveSmartContract.address, // spender
      BigInt(100000000000000000000000000000000000000000000000000n) // unlimited allowance
    ],
    to: moxieSmartContract.address,
  })
})


app.transaction('/buy-n-burn-all/:subjectId', async (c, next) => {
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
  const { address } = c;
  const { subjectId } = c.req.param();

  const hexAmountBalance = await moxieSmartContract.read.balanceOf([
    address as `0x${string}`,
  ]);

  return c.contract({
    abi: moxieBondingCurveSmartContract.abi,
    chainId: 'eip155:8453',
    functionName: 'buySharesFor',
    args: [
      subjectId as `0x${string}`, // subjectId
      BigInt(hexAmountBalance), // amount of MOXIE to burn
      '0x0000000000000000000000000000000000000000', // onBehalfOf burn address
      0n // minReturnAmountAfterFee
    ],
    to: moxieBondingCurveSmartContract.address,
  })
})


app.transaction('/buy-n-burn-selected/:subjectId', async (c, next) => {
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
  const { inputText } = c;
  const { subjectId } = c.req.param();

  const inputValue = inputText ? parseFloat(inputText) : 0;

  const tokenDecimalPrecision = 18;
  const amountMoxieInWei = inputValue * Math.pow(10, tokenDecimalPrecision);

  return c.contract({
    abi: moxieBondingCurveSmartContract.abi,
    chainId: 'eip155:8453',
    functionName: 'buySharesFor',
    args: [
      subjectId as `0x${string}`, // subjectId
      BigInt(amountMoxieInWei), // amount of MOXIE to burn
      '0x0000000000000000000000000000000000000000', // onBehalfOf burn address
      0n // minReturnAmountAfterFee
    ],
    to: moxieBondingCurveSmartContract.address,
  })
})


app.frame("/share-amount/:fanTokenSymbol", async (c) => {
  const { transactionId, buttonValue } = c;
  const { fanTokenSymbol } = c.req.param();

  const txHash = transactionId || buttonValue;

  const isTransactionSuccess = await publicClient.waitForTransactionReceipt({ 
    hash: txHash as `0x${string}`
  });

  if (isTransactionSuccess.status === 'success') {
    const transaction = await publicClient.getTransaction({ 
      hash: txHash as `0x${string}`
    });

    const inputData = transaction.input;

    const decoded = decodeFunctionData({
      abi: moxieBondingCurveSmartContract.abi,
      data: inputData,
    });

    const _depositAmount = decoded.args[1];
    const formatTotalBurned = formatUnits(_depositAmount, 18);
    const totalBurned = parseFloat(formatTotalBurned);
    const totalMoxieBurned = totalBurned.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const tokenDetails = await getTokenDetails(fanTokenSymbol || "");

    console.log(`Search Results for ${fanTokenSymbol}`);

    const { name, uniqueHolders } = tokenDetails;

    const shareText = `I just burned ${totalMoxieBurned} MOXIE for rewarding my ${uniqueHolders} Fan Token (${name}) Holders.\n\nNice Frame @0x94t3z.eth & @thenumb.eth 👏 👏 @moxie.eth`;

    const embedUrlByUser = `${embedUrl}/share-by-user/${fanTokenSymbol}/${totalMoxieBurned}`;

    const SHARE_BY_USER = `${baseUrl}?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(embedUrlByUser)}`;

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
              I just rewarded
            </Text>
            <Box
              backgroundColor="modal"
              padding-left="18"
              paddingRight="18"
              borderRadius="80"
              boxShadow="0 0 10px rgba(0, 0, 0, 0.1)"
            >
              <Text
                size="32"
                color="fontcolor"
                font="subtitle_moxie"
                align="center"
              >
                M {totalMoxieBurned}{" "}
              </Text>
            </Box>
            <Text
              size="32"
              color="fontcolor"
              font="subtitle_moxie"
              align="center"
            >
              for {uniqueHolders}
            </Text>
            <Box
              backgroundColor="modal"
              padding-left="18"
              paddingRight="18"
              borderRadius="8"
            >
              <Text
                size="48"
                color="fontcolor"
                font="title_moxie"
                align="center"
              >
                {name} fans
              </Text>
            </Box>
          </Box>
        </Box>
      ),
      intents: [
        <Button.Link href={SHARE_BY_USER}>Share</Button.Link>,
        <Button action="/">Try again 🔥</Button>,
      ],
    });
  } else {
    return c.res({
      imageAspectRatio: "1.91:1",
      image: '/waiting.gif',
      intents: [
        <Button value={txHash} action={`/share-amount/${fanTokenSymbol}`}>
          Refresh
        </Button>,
      ],
    });
  }
});


app.frame("/share-by-user/:fanTokenSymbol/:totalMoxieBurned", async (c) => {
  const { fanTokenSymbol, totalMoxieBurned } = c.req.param();

  const tokenDetails = await getTokenDetails(fanTokenSymbol || "");

  console.log(`Search Results for ${fanTokenSymbol}`);

  const { name, uniqueHolders } = tokenDetails;

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
            I just rewarded
          </Text>
          <Box
            backgroundColor="modal"
            padding-left="18"
            paddingRight="18"
            borderRadius="80"
            boxShadow="0 0 10px rgba(0, 0, 0, 0.1)"
          >
            <Text
              size="32"
              color="fontcolor"
              font="subtitle_moxie"
              align="center"
            >
              M {totalMoxieBurned}{" "}
            </Text>
          </Box>
          <Text
            size="32"
            color="fontcolor"
            font="subtitle_moxie"
            align="center"
          >
            for {uniqueHolders}
          </Text>
          <Box
            backgroundColor="modal"
            padding-left="18"
            paddingRight="18"
            borderRadius="8"
          >
            <Text
              size="48"
              color="fontcolor"
              font="title_moxie"
              align="center"
            >
              {name} fans
            </Text>
          </Box>
        </Box>
      </Box>
    ),
    intents: [
      <Button action="/">Give it a try!</Button>,
    ],
  });
});


// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);

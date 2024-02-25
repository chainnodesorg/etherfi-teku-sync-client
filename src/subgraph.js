import { request, gql } from 'graphql-request';

export async function retrieveBidsFromSubgraph(GRAPH_URL, BIDDER, FIRST, SKIP) {
  const bidsQuery = gql`
    {
      bids(first: ${FIRST}, skip: ${SKIP}, where: { bidderAddress: "${BIDDER}", status: "WON", validator_not: null, validator_: { phase_in: ["LIVE", "WAITING_FOR_APPROVAL"] } }) {
        id
        bidderAddress
        pubKeyIndex
        validator {
            id
            phase
            ipfsHashForEncryptedValidatorKey
            validatorPubKey
            etherfiNode
            BNFTHolder
        }
      }
    }
    `;

  let bids = [];
  try {
    const { bids: result } = await request(GRAPH_URL, bidsQuery);
    bids = result;
  } catch (error) {
    console.log(error);
    console.error('an error occurred querying bids');
  }
  return bids;
}

export async function retrieveAllBidsIterated(GRAPH_URL, BIDDER) {
  const bids = [];
  const bidsIterator = 1000;
  let bidsSkip = 0;
  let bidsEndReached = false;
  while (!bidsEndReached) {
    const newBids = await retrieveBidsFromSubgraph(GRAPH_URL, BIDDER, bidsIterator, bidsSkip);
    bids = bids.concat(newBids);

    if (newBids.length < bidsIterator) {
      bidsEndReached = true;
    } else {
      bidsSkip = bidsSkip + bidsIterator;
    }

    if (bids.length > 100000) {
      console.log('ERROR: More than 100k bids fetched. You should think about a different mechanism.');
    }
  }

  return bids;
}

export async function retrieveCleanupBidsFromSubgraph(GRAPH_URL, BIDDER, FIRST, SKIP) {
  const bidsQuery = gql`
    {
      bids(first: ${FIRST}, skip: ${SKIP}, where: { bidderAddress: "${BIDDER}", status: "WON", validator_not: null, validator_: { phase_not_in: ["LIVE", "WAITING_FOR_APPROVAL"] } }) {
        id
        bidderAddress
        pubKeyIndex
        validator {
            id
            phase
            ipfsHashForEncryptedValidatorKey
            validatorPubKey
            etherfiNode
            BNFTHolder
        }
      }
    }
    `;

  let bids = [];
  try {
    const { bids: result } = await request(GRAPH_URL, bidsQuery);
    bids = result;
  } catch (error) {
    console.log(error);
    console.error('an error occurred querying cleanup bids');
  }
  return bids;
}

export async function retrieveAllCleanupBidsIterated(GRAPH_URL, BIDDER) {
  const bids = [];
  const bidsIterator = 1000;
  let bidsSkip = 0;
  let bidsEndReached = false;
  while (!bidsEndReached) {
    const newBids = await retrieveCleanupBidsFromSubgraph(GRAPH_URL, BIDDER, bidsIterator, bidsSkip);
    bids = bids.concat(newBids);

    if (newBids.length < bidsIterator) {
      bidsEndReached = true;
    } else {
      bidsSkip = bidsSkip + bidsIterator;
    }

    if (bids.length > 100000) {
      console.log('ERROR: More than 100k bids fetched. You should think about a different mechanism.');
    }
  }

  return bids;
}

import { request, gql } from 'graphql-request';

export const retrieveBidsFromSubgraph = async (GRAPH_URL, BIDDER) => {
  const bidsQuery = gql`
    {
      bids(first: 1000, where: { bidderAddress: "${BIDDER}", status: "WON", validator_not: null, validator_: { phase_in: ["LIVE", "WAITING_FOR_APPROVAL"] } }) {
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
};

export const retrieveCleanupBidsFromSubgraph = async (GRAPH_URL, BIDDER) => {
  const bidsQuery = gql`
    {
      bids(first: 1000, where: { bidderAddress: "${BIDDER}", status: "WON", validator_not: null, validator_: { phase_not_in: ["LIVE", "WAITING_FOR_APPROVAL"] } }) {
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
};

import { request, gql } from 'graphql-request';

export const retrieveBidsFromSubgraph = async (GRAPH_URL, BIDDER) => {
  const bidsQuery = gql`
    {
      bids(first: 1000, where: { bidderAddress: "${BIDDER}", status: "WON", validator_not: null, validator_: { phase: LIVE} }) {
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

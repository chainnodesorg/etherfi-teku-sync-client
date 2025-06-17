import 'dotenv/config';
import Joi from 'joi';

export const ETHERFI_SC_RESTART_MODE_CASES = {
  DOCKER: 'docker',
  KUBERNETES: 'kubernetes',
  NONE: 'none',
};

export const ETHERFI_SC_KEY_STORAGE_MODE_CASES = {
  DISK: 'disk',
  VAULT: 'vault',
};

export const ETHERFI_SC_VAULT_AUTHENTICATION_MODE_CASES = {
  TOKEN: 'token',
  KUBERNETES: 'kubernetes',
};

const schema = Joi.object({
  ETHERFI_SC_IPFS_GATEWAY: Joi.string().uri({ scheme: 'https' }).required(),
  ETHERFI_SC_GRAPH_URL: Joi.string().uri({ scheme: 'https' }).required(),
  ETHERFI_SC_BIDDER: Joi.string().hex({ prefix: true }).length(42).required(),
  ETHERFI_SC_PRIVATE_KEYS_FILE_LOCATION: Joi.string().required(),
  ETHERFI_SC_PASSWORD: Joi.string().required(),
  ETHERFI_SC_TEKU_PROPOSER_FILE: Joi.string().optional(),
  ETHERFI_SC_RESTART_MODE: Joi.string()
    .pattern(
      new RegExp(
        `^(${ETHERFI_SC_RESTART_MODE_CASES.DOCKER}|${ETHERFI_SC_RESTART_MODE_CASES.KUBERNETES}|${ETHERFI_SC_RESTART_MODE_CASES.NONE})$`,
      ),
    )
    .required(),
  ETHERFI_SC_EXCLUDED_VALIDATORS: Joi.string().default('').optional(),
  ETHERFI_SC_CLEANUP_EXITED_KEYS: Joi.boolean().required(),

  ETHERFI_SC_KEY_STORAGE_MODE: Joi.string()
    .pattern(new RegExp(`^(${ETHERFI_SC_KEY_STORAGE_MODE_CASES.DISK}|${ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT})$`))
    .required(),
})
  .when(
    Joi.object({
      ETHERFI_SC_KEY_STORAGE_MODE: Joi.string()
        .pattern(new RegExp(`^(${ETHERFI_SC_KEY_STORAGE_MODE_CASES.DISK})$`))
        .required(),
    }).unknown(),
    {
      then: Joi.object({
        ETHERFI_SC_DISK_OUTPUT_LOCATION: Joi.string().required(),
      }),
    },
  )
  .when(
    Joi.object({
      ETHERFI_SC_KEY_STORAGE_MODE: Joi.string()
        .pattern(new RegExp(`^(${ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT})$`))
        .required(),
    }).unknown(),
    {
      then: Joi.object({
        ETHERFI_SC_VAULT_URL: Joi.string().uri({ scheme: 'https' }).required(),
        ETHERFI_SC_VAULT_AUTHENTICATION_MODE: Joi.string()
          .pattern(
            new RegExp(`^(${ETHERFI_SC_VAULT_AUTHENTICATION_MODE_CASES.TOKEN}|${ETHERFI_SC_VAULT_AUTHENTICATION_MODE_CASES.KUBERNETES})$`),
          )
          .required(),
      })
        .when(
          Joi.object({
            ETHERFI_SC_VAULT_AUTHENTICATION_MODE: Joi.string()
              .pattern(new RegExp(`^(${ETHERFI_SC_VAULT_AUTHENTICATION_MODE_CASES.TOKEN})$`))
              .required(),
          }).unknown(),
          {
            then: Joi.object({
              ETHERFI_SC_VAULT_CLIENT_TOKEN: Joi.string().required(),
            }),
          },
        )
        .when(
          Joi.object({
            ETHERFI_SC_VAULT_AUTHENTICATION_MODE: Joi.string()
              .pattern(new RegExp(`^(${ETHERFI_SC_VAULT_AUTHENTICATION_MODE_CASES.KUBERNETES})$`))
              .required(),
          }).unknown(),
          {
            then: Joi.object({
              ETHERFI_SC_VAULT_KUBERNETES_AUTH_PATH: Joi.string().required(),
              ETHERFI_SC_VAULT_KUBERNETES_SERVICE_ACCOUNT_PATH: Joi.string().required(),
            }),
          },
        ),
    },
  )
  .unknown();

export const getConfig = () => {
  const parsedVariables = schema.validate(process.env);
  if (parsedVariables.error || !parsedVariables.value) {
    throw Error(`Could not load or validate environment variables with error: ${parsedVariables.error}`);
  }

  return {
    IPFS_GATEWAY: parsedVariables.value.ETHERFI_SC_IPFS_GATEWAY,
    GRAPH_URL: parsedVariables.value.ETHERFI_SC_GRAPH_URL,
    BIDDER: parsedVariables.value.ETHERFI_SC_BIDDER,
    PRIVATE_KEYS_FILE_LOCATION: parsedVariables.value.ETHERFI_SC_PRIVATE_KEYS_FILE_LOCATION,
    PASSWORD: parsedVariables.value.ETHERFI_SC_PASSWORD,
    TEKU_PROPOSER_FILE: parsedVariables.value.ETHERFI_SC_TEKU_PROPOSER_FILE,
    RESTART_MODE: parsedVariables.value.ETHERFI_SC_RESTART_MODE,
    EXCLUDED_VALIDATORS: parsedVariables.value.ETHERFI_SC_EXCLUDED_VALIDATORS.split(',').map((el) => el.toLowerCase().trim()),
    CLEANUP_EXITED_KEYS: parsedVariables.value.ETHERFI_SC_CLEANUP_EXITED_KEYS,
    KEY_STORAGE_MODE: parsedVariables.value.ETHERFI_SC_KEY_STORAGE_MODE,
    DISK_OUTPUT_LOCATION: parsedVariables.value.ETHERFI_SC_DISK_OUTPUT_LOCATION,
    VAULT_URL: parsedVariables.value.ETHERFI_SC_VAULT_URL,
    VAULT_AUTHENTICATION_MODE: parsedVariables.value.ETHERFI_SC_VAULT_AUTHENTICATION_MODE,
    VAULT_CLIENT_TOKEN: parsedVariables.value.ETHERFI_SC_VAULT_CLIENT_TOKEN,
    VAULT_KUBERNETES_AUTH_PATH: parsedVariables.value.ETHERFI_SC_VAULT_KUBERNETES_AUTH_PATH,
    VAULT_KUBERNETES_SERVICE_ACCOUNT_PATH: parsedVariables.value.ETHERFI_SC_VAULT_KUBERNETES_SERVICE_ACCOUNT_PATH,
  };
};

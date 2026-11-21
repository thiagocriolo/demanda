import {
  ContractApiError,
  contractToEntityRecord,
  createContract,
  deleteContract,
  entityValuesToContractInput,
  getContract,
  updateContract,
} from "../../contracts/client";
import type { EntityPersistenceAdapter } from "./types";

export const contractEntityAdapter: EntityPersistenceAdapter = {
  async load(id) {
    return contractToEntityRecord(await getContract(id));
  },

  async save({ mode, values, current }) {
    const contract =
      mode === "edit" && current
        ? await updateContract(
            current.id,
            entityValuesToContractInput(values),
          )
        : await createContract(entityValuesToContractInput(values));
    return contractToEntityRecord(contract);
  },

  async archive(id) {
    throw new ContractApiError(405, "Contratos nÃ£o podem ser arquivados.");
  },

  async delete(id, _current, options) {
    await deleteContract(id, options);
  },

  isApiError(cause) {
    return cause instanceof ContractApiError;
  },
};

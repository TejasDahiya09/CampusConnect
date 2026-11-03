import { professionalHttpCases, type HttpContractContext } from './professional-http-contract.js';
import { confidentialityName } from './professional-http-confidentiality.js';
export const disabledStorageName =
  'disabled storage uses real account lookup without professional storage queries';
/** These are behaviors only; the Node parent container is never part of the inventory. */
export function createProfessionalHttpPlan(
  context: HttpContractContext,
  extra: { disabledStorage: () => Promise<void>; storageFailure: () => Promise<void> },
) {
  return [
    ...professionalHttpCases.map((scenario) => ({
      name: scenario.name,
      run: () => scenario.run(context),
    })),
    { name: disabledStorageName, run: extra.disabledStorage },
    { name: confidentialityName, run: extra.storageFailure },
  ];
}

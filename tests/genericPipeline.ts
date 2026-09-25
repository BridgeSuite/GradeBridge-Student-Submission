// One bundle for the generic-sheet tests, so the QR decoder `initQrReader`
// builds is the same module instance `registerPage` decodes with. Loaded
// separately, each bundle carries its own singleton and the second one has
// never been initialised.
export { initQrReader } from '../services/qrDecode';
export { registerPage } from '../services/registration';
export { cropGenericBox, cropRegion } from '../services/cropRegions';
export { measureInk } from '../services/inkBox';
export { parseLayoutCsv } from '../services/layoutMap';
export * from '../services/genericSheet';
export { GENERIC_WORDING } from '../services/genericWording';
export {
  buildSubmissionPackage, serialiseSubmissionJson, cropBlobKey,
} from '../services/submissionPackage';
export { confirmPersonalInfo } from '../services/personalInfo';
export { chooseLayoutSource } from '../services/assignmentBundle';
export { decryptJson, isEncoded } from '../cryptoService';

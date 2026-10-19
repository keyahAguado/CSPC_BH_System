// Browser Back can revisit a registration step left behind by submission or
// verification. Explicit Edit/Add Property navigation must still open the form.
export function trackingBackDestination(to, from, state) {
  const registration = ['Register', 'OwnerDetailsRegister'].includes(to.name);
  return from.name === 'TrackApplication' && registration && state?.current === to.fullPath && state?.forward === from.fullPath ? '/' : null;
}

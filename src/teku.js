import got from 'got';

export async function sigHupAllTekus() {
  const allContainers = JSON.parse(await got('http://unix:/var/run/docker.sock:/containers/json', { enableUnixSockets: true }));

  for (const container of allContainers) {
    if (container.Image.toLowerCase().trim().includes('consensys/teku')) {
      // sighup
      await got.post(`http://unix:/var/run/docker.sock:/containers/${container.Id}/kill?signal=HUP`, { enableUnixSockets: true });
    }
  }
}

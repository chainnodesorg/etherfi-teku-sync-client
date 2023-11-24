import got from 'got';
import { execa } from 'execa';

export async function sigHupAllTekus() {
  const allContainers = JSON.parse((await got('http://unix:/var/run/docker.sock:/containers/json', { enableUnixSockets: true })).body);

  for (const container of allContainers) {
    if (container.Image.toLowerCase().trim().includes('consensys/teku')) {
      // sighup
      await got.post(`http://unix:/var/run/docker.sock:/containers/${container.Id}/kill?signal=HUP`, { enableUnixSockets: true });
    }
  }
}

function parseProcesses(list, ps) {
  var p = ps.split(/ +/);

  list.push({
    user: p[0],
    pid: p[1],
    cpu: parseFloat(p[2]),
    mem: parseFloat(p[3]),
    vsz: p[4],
    rss: p[5],
    tt: p[6],
    stat: p[7],
    started: p[8],
    time: p[9],
    command: p.slice(10).join(' '),
  });

  return list;
}
async function psAux() {
  return new Promise((resolve, reject) => {
    execa('ps', ['aux']).then((result) => {
      var processes = result.stdout.split('\n');

      //Remove header
      processes.shift();
      processes = processes.reduce(parseProcesses, []);

      resolve(processes);
    });
  });
}

export async function kubernetesSigHupTeku() {
  const processes = await psAux();
  const tekus = processes.filter((element) => {
    const command = element.command.toLowerCase();
    if (command.includes('teku')) {
      return true;
    }

    return false;
  });

  for (const teku of tekus) {
    const result = await execa('kill', ['-HUP', `${teku.pid}`]);
    console.log('Killed 1 teku');
    console.log(result);
  }
}

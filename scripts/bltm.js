import { LOCAL_PACK_NAMESPACE, NAMESPACE } from './constants.js';
import { tokenManager } from './TokenManager.js';
import { resources } from './resources.js';
import { utils } from './utils.js';

let allPacks = [];

// Listen for hooks from other modules
Hooks.on('bltm.register.pack', (resources, namespace) => {
  if (typeof resources !== 'object' || typeof namespace !== 'string') {
    console.warn(`${NAMESPACE} | Invalid registration `, resources, namespace);
    return;
  }

  const namespacedFlat = utils.addNamespaceToResources(resources, namespace);
  allPacks.push(namespacedFlat);

  console.log(`${NAMESPACE} | Registered ${Object.keys(namespacedFlat).length} assets under namespace '${namespace}'`);
});

Hooks.once('ready', () => {
  if (!game.user.isGM) return;

  console.log(`${NAMESPACE} | Module ready.`);

  // Add local resources to TokenManager
  const localResources = utils.addNamespaceToResources(resources, LOCAL_PACK_NAMESPACE);
  allPacks.push(localResources);

  // Let token packs register now
  Hooks.callAll('bltm.ready');
});

Hooks.on('getSceneControlButtons', controls => {
  const IS_V13 = foundry.utils.isNewerVersion(game.version, '13');

  const tokenManagerButton = {
    name: 'tokenmanager',
    title: 'Token Manager',
    icon: 'bltm bltm-icon-tokenmanager',
    visible: game.user.isGM,
    button: true,
    onChange: (event, active) => {
      if (active || !IS_V13) {
        tokenManager(allPacks);
      }
    },
  };

  if (IS_V13) {
    controls['tokens'].tools[tokenManagerButton.name] = tokenManagerButton;
  } else {
    // Legacy code for Foundry v12
    tokenManagerButton.onClick = tokenManagerButton.onChange;

    const bar = controls.find(c => c.name === 'token');
    bar.tools.push(tokenManagerButton);
  }
});

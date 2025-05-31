export const utils = {
  addNamespaceToResources: function (resources, namespace) {
    const flat = foundry.utils.flattenObject(resources);
    const result = {};

    for (const [key, value] of Object.entries(flat)) {
      if (typeof value === 'string' && (value.endsWith('.webp') || value.endsWith('.webm'))) {
        result[`${namespace}.${key}`] = value;
      }
    }

    return result;
  },
};

export const track = (eventName, params = {}) => {
  if (typeof window.dataLayer !== 'undefined') {
    window.dataLayer.push({
      event: eventName,
      ...params,
    });
  }
};

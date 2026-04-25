const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Intenta crear usando canvas o una alternativa simple
// Si canvas no está disponible, usaremos una solución con imagen base64

try {
  const canvas = require('canvas');
  console.log('Canvas disponible');
} catch (e) {
  console.log('Canvas no disponible, usando método alternativo con jimp');
  
  // Intenta con jimp
  try {
    const Jimp = require('jimp');
    
    Jimp.read(path.join(__dirname, 'public/assets/payment-logos/yape-web.png'))
      .then(image => {
        // Crea fondo púrpura (7B2F8E)
        const purple = Jimp.cssColorToHex('#7B2F8E');
        
        // Redimensiona y expande con fondo púrpura
        const size = Math.max(image.bitmap.width, image.bitmap.height);
        const newImage = new Jimp(512, 512, purple);
        
        // Centra el logo
        const x = (512 - image.bitmap.width) / 2;
        const y = (512 - image.bitmap.height) / 2;
        
        newImage.composite(image, x, y);
        newImage.write(path.join(__dirname, 'public/assets/payment-logos/yape.png'));
        console.log('Logo Yape con fondo púrpura creado');
      })
      .catch(err => console.error('Error:', err));
  } catch (e2) {
    console.error('Jimp tampoco disponible');
  }
}

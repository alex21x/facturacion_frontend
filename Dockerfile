FROM node:22

# Carpeta de trabajo
WORKDIR /app

# Copiar dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar todo
COPY . .

# Exponer puerto
EXPOSE 3000

# Ejecutar React
CMD ["npm", "run", "dev", "--", "--host"]
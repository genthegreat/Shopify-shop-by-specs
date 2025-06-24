FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy the web directory
COPY web .

# Install only production dependencies
RUN npm install --only=production

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run injeta a variável PORT
ENV PORT=8080

# Warm-up do cache na inicialização + gunicorn para produção
CMD ["sh", "-c", "python -c \"from server import warmup; warmup()\" && gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120 server:app"]

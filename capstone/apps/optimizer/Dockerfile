# The optimizer image. Small, single-stage: nothing here needs a compiler
# (highspy ships a prebuilt wheel), so a multi-stage build would add nothing.
FROM python:3.11-slim

WORKDIR /app

# Dependencies first: this layer is cached until requirements.txt changes, so
# editing solve.py does not reinstall everything.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY forecast.py solve.py main.py ./

# Do not run as root. If the container were ever compromised, it starts with
# no privileges.
RUN useradd --system --no-create-home optimizer
USER optimizer

# Prometheus metrics (jobs solved, solve time) are served on this port.
EXPOSE 8000

# -u = unbuffered output, so log lines reach CloudWatch immediately.
CMD ["python", "-u", "main.py"]

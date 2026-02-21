# Oracle VM — Webhook Receiver

Files to deploy on the Oracle VM for the OpenClaw webhook receiver.

## Deploy steps

1. Copy files to VM:
   ```bash
   scp vm/webhook-receiver.js <oracle-vm>:~/clawd/webhook-receiver.js
   scp vm/openclaw-webhook.service <oracle-vm>:/tmp/openclaw-webhook.service
   ```

2. On the VM — install Express (if not already):
   ```bash
   cd ~/clawd && npm init -y && npm install express
   ```

3. Edit the service file with real values:
   ```bash
   sudo cp /tmp/openclaw-webhook.service /etc/systemd/system/openclaw-webhook.service
   sudo nano /etc/systemd/system/openclaw-webhook.service
   ```
   Replace:
   - `REPLACE_WITH_YOUR_SECRET` → same value as `OPENCLAW_WEBHOOK_SECRET` Firebase secret
   - `REPLACE_WITH_BOT_TOKEN_FROM_OPENCLAW_JSON` → `botToken` from `~/.openclaw/openclaw.json`
   - `REPLACE_WITH_CHANNEL_ID` → Slack channel ID of `#tell-asty` (right-click channel → View details → scroll down)

4. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable openclaw-webhook
   sudo systemctl start openclaw-webhook
   sudo systemctl status openclaw-webhook
   ```

5. Open port 3001 (iptables):
   ```bash
   sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
   sudo iptables-save | sudo tee /etc/iptables/rules.v4
   ```

6. Open port 3001 in OCI Console:
   - Networking → VCN → Security Lists → Default Security List
   - Add Ingress Rule: TCP, port 3001, source 0.0.0.0/0

7. Test from your Mac:
   ```bash
   curl -X POST http://<VM_PUBLIC_IP>:3001/webhook \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: <your-secret>" \
     -d '{"event":"task_assigned","action":"created","task":{"id":"test","title":"Hello from Cloud","status":"todo","priority":"low"}}'
   # Expected: {"ok":true}  and #tell-asty shows the Slack message
   ```

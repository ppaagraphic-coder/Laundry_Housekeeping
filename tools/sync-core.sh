#!/bin/sh
# คัดลอก js/core.js -> apps-script/Core.gs (ต้องเหมือนกันทุกครั้งที่แก้ตรรกะ)
cd "$(dirname "$0")/.." && cp js/core.js apps-script/Core.gs && echo "synced apps-script/Core.gs"

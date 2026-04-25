FROM drakkan/sftpgo:alpine
USER 0:0

# Custom branding overrides (loaded via SFTPGO_HTTPD__BINDINGS__0__BRANDING__WEB_CLIENT__EXTRA_CSS)
RUN mkdir -p /var/lib/sftpgo/static/branding && \
    printf '%s\n' '.app-sidebar-logo{display:none!important;}' \
    > /var/lib/sftpgo/static/branding/hide-logo.css

# Volume on /srv/sftpgo/data is bind-mounted by Railway with restrictive perms.
# Open it up at startup so the in-container root user can mkdir per-user homes.
CMD ["sh", "-c", "chmod 0777 /srv/sftpgo/data 2>&1 || echo 'chmod failed (continuing)'; exec sftpgo serve"]

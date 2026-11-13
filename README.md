# Letter Hive

A daily word game with a built-in offline dictionary, light and dark themes, and progress saved on your device.

Open `index.html` in a browser to play. No build step or dependencies are required.

- `index.html` contains the page markup.
- `letter-hive.css` contains the styles.
- `letter-hive.js` contains the game logic and dictionary.

## GitHub Pages

The included workflow publishes the static site when changes are pushed to `main`. It can also be run manually from the Actions tab. Only the HTML, CSS, and JavaScript files are included in the deployment.

1. Create an empty GitHub repository named `letter-hive` under your account.
2. Connect this checkout and push your committed changes:

   ```sh
   git remote add origin https://github.com/YOUR-USERNAME/letter-hive.git
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
4. Open **Actions → Deploy to GitHub Pages → Run workflow** to deploy, or push another change to `main`.

The deployment reports the live URL, normally `https://YOUR-USERNAME.github.io/letter-hive/`. Relative asset paths also support an account site at `https://YOUR-USERNAME.github.io/` if the repository is named `YOUR-USERNAME.github.io`.

Progress and theme preferences are saved in each browser's local storage. Progress from a local file does not transfer to the hosted site.

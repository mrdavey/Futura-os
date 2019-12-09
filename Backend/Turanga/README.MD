# Turanga

## Deployment to PRODUCTION
- Turanga compute engine instance automatically pulls from Github on boot up
- See Turanga startVM function

## Dyanmically and adaptively updates trade settings, for Leela to use
 - Runs as a Google Compute VM.
 - How it works:
    - On startup, it runs a startup script (see below)
    - It uses the Firebase CLI to run `firebase emulator` locally, using the most up to date functions (`git pull`ed) to backtest the most recent data
    - It runs through a few iterations and finds the optimal trade settings that provide the highest alpha over a certain time period
    - It updates these trade settings on Firestore for use in production by Leela
 - The VM is started and stopped by Turanga firebase functions (to save on cost 😇)

## Notes:
 - If having disk space problems (most likely due to firebase debug logs filling up):
    - Check inode usage:
        ```
        df -i
        ```
    - Check persistent disk usage:
        ```
        df -h
        ```
 - To check size of directories:
    ```
    sudo du -hsx /home/david/Futura/* | sort -rh | head -n 35
    ```
 - To delete a directory/file:
    ```
    rm /home/david/Futura/firebase-debug.log
    ```
    
## Reasoning for a separate VM
 - Functions served locally do not have an execution timeout, enabling the backtest function to run indefinitely for a high number of iterations
 - Firestore emulator provides faster performance + reduces hits on the production DB (reducing costs)

## To set up a new VM
1. SSH into the VM
2. Get and install the latest official node image
    ```bash
    curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
3. Install firebase tools
    ```bash
    sudo npm install -g firebase-tools
    ```
4. Install OpenJDK for firebase emulator
    ```bash
    sudo apt-get install openjdk-8-jre
    # Confirm Yes (Y)
    ```
5. Install git
    ```bash
    sudo apt install git-all
    # Confirm Yes (Y)
    ```
6. Clone Futura directory (use Github application user key), delete application key after use
    ```bash
    git clone https://github.com/mrdavey/Futura.git
    ```
8. Authenticate for Firebase tools
    ```bash
    firebase login --no-localhost
    # Follow instructions for Firebase Auth
        # Type `y` and enter when prompted
        # Paste auth code and enter
        # Should get a confirmation of logged in user
    ```
9. Setup the environment for the startup script to run, by SSH in and:
    ```bash
    # create RSA SSH key in home directory
    cd ~
    ssh-keygen -t rsa
    # enter for all values

    # View the created keys
    cat .ssh/id_rsa.pub

    # Copy + paste the keys to Github SSH keys page: https://github.com/settings/keys

    # Add the relevant ssh git remote branch
    cd Futura
    git remote add ssh git@github.com:mrdavey/Futura.git

    # Double check added correctly
    git remote -v

    # Pull changes
    git pull ssh master

    # Enable 'everyone' to be able to modify repo (for startup script reasons): https://stackoverflow.com/a/6448326/4769084
    sudo chmod -R a+rwX .
    ```
9. Setup VM startup script: https://cloud.google.com/compute/docs/startupscript
    - Create startup script:
        ```bash
        # Print everything out (for debugging)
        set -x

        # When the VM is booting up, the default directory is `/`. 
        # When using the script runner, the default is `/home/david/`
        # Therefore leave this line in the startup script, but remove if using the script runner
        export HOME=/home/david
        cd home/david

        # Perform actions as user `david` with `sudo -u david`

        # Discard any changes (usually due to npm install on package-lock.json file)
        cd Futura
        echo 'Updating Git directory'
        sudo -u david git reset --hard
        sudo -u david git clean -df
        sudo -u david git pull ssh master
        echo 'Successfully updated Git directory'

        sudo -u david rm /home/david/Futura/firebase-debug.log

        echo 'Starting Firebase'
        cd functions
        npm install
        cd ..

        # Start Firebase emulators
        sudo -u david firebase emulators:start --only functions,firestore &
        sleep 25s

        # Start Turanga on localhost:3000
        cd Backend/Turanga
        npm install
        npm start &
        sleep 10s

        # Hit endpoint to perform Turanga backtesting
        curl http://localhost:3000 &
        ```
10. (Optional) To check the startup script runs correctly, open SSH and run, then watch the terminal (inital `export HOME` and `cd home/` will need to be modified):
    ```bash
    sudo google_metadata_script_runner --script-type startup --debug
    ```
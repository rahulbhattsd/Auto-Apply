
        const name = process.argv[3];
        if (name === '@autoapply/discovery-worker') {
            console.log('Mock discovery-worker crashing...');
            process.exit(1);
        } else {
            console.log('Mock ' + name + ' running...');
            process.on('SIGTERM', () => process.exit(0));
            setInterval(() => {}, 10000);
        }

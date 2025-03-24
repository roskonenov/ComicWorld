import styles from './LoginRegister.module.css';

export default function LoginRegister() {
    return (
        <body>
            <div className={styles.main}>
                <input className={styles.change} type="checkbox" id="chk" aria-hidden="true" />

                <div className={styles.signup}>
                    <form>
                        <label htmlFor="chk" aria-hidden="true">Sign up</label>
                        <input type="text" name="txt" placeholder="User name" required="" />
                        <input type="email" name="email" placeholder="Email" required="" />
                        <input type="number" name="broj" placeholder="BrojTelefona" required="" />
                        <input type="password" name="pswd" placeholder="Password" required="" />
                        <button>Sign up</button>
                    </form>
                </div>

                <div className={styles.login}>
                    <form>
                        <label htmlFor="chk" aria-hidden="true">Login</label>
                        <input type="email" name="email" placeholder="Email" required="" />
                        <input type="password" name="pswd" placeholder="Password" required="" />
                        <button>Login</button>
                    </form>
                </div>
            </div>
        </body>
    );
}
import Navigation from "./navigation/Navigation"
import styles from "./Header.module.css"
import Logo from "./logo/Logo";


export default function Header() {
    return (
        <header className={styles.header}>
            <Logo />
            <Navigation />
        </header>
    );
}